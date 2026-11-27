import {
  commandSchema,
  undoableCommands,
  type CommandOf,
  type DomainCommand,
  type ParsedCommand,
  type Placement,
} from './commands';
import type { Change, Mutation, PlannerEnv, ReadContext } from './context';
import {
  ENTITY_SCHEMA_VERSION,
  LIMITS,
  parentIdOf,
  type Block,
  type Entity,
  type EntityKind,
  type EntityOf,
  type Folder,
  type Notebook,
  type Page,
} from './entities';
import { DomainError } from './errors';
import { jsonByteLength, type JsonValue } from './json';
import { needsRebalance, rankBetween, ranksBetween, sortByRank } from './rank';

export function parseCommand(input: DomainCommand): ParsedCommand {
  const result = commandSchema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new DomainError('VALIDATION', 'error.command.invalid', {
      details: { path: issue?.path.join('.') ?? '', issue: issue?.code ?? 'unknown' },
    });
  }
  return result.data;
}

/**
 * Pure command planner: reads through `ctx`, never writes. Returns the full set of record changes
 * which storage then applies atomically together with the history entry.
 */
export async function planCommand(
  input: DomainCommand,
  ctx: ReadContext,
  env: PlannerEnv,
): Promise<Mutation> {
  const command = parseCommand(input);
  if (!(await ctx.hasWorkspace(command.workspaceId))) {
    throw new DomainError('NOT_FOUND', 'error.workspace.notFound');
  }
  const plan = new Plan(command, ctx, env);
  await plan.run();
  return plan.toMutation();
}

const childKindsOf: Record<EntityKind, readonly EntityKind[]> = {
  folder: ['folder', 'notebook'],
  notebook: ['page'],
  page: ['block'],
  block: [],
};

const parentKindOf: Record<EntityKind, EntityKind | null> = {
  folder: 'folder',
  notebook: 'folder',
  page: 'notebook',
  block: 'page',
};

class Plan {
  private readonly staged = new Map<string, Change>();
  private readonly now: string;
  private primary: Mutation['primary'];
  private batchId: string | undefined;

  constructor(
    private readonly command: ParsedCommand,
    private readonly ctx: ReadContext,
    private readonly env: PlannerEnv,
  ) {
    this.now = env.clock.now();
  }

  toMutation(): Mutation {
    const mutation: Mutation = {
      commandType: this.command.type,
      changes: [...this.staged.values()],
      undoable: undoableCommands.has(this.command.type),
    };
    if (this.primary) mutation.primary = this.primary;
    if (this.batchId) mutation.batchId = this.batchId;
    return mutation;
  }

  async run(): Promise<void> {
    const c = this.command;
    switch (c.type) {
      case 'createFolder':
        return this.createFolder(c);
      case 'createNotebook':
        return this.createNotebook(c);
      case 'createPage':
        return this.createPage(c);
      case 'rename':
        return this.rename(c);
      case 'move':
        return this.move(c);
      case 'createBlock':
        return this.createBlock(c);
      case 'updateBlock':
        return this.updateBlock(c);
      case 'setBlockCollapsed':
        return this.setBlockCollapsed(c);
      case 'duplicateBlock':
        return this.duplicateBlock(c);
      case 'duplicatePage':
        return this.duplicatePage(c);
      case 'trash':
        return this.trash(c);
      case 'restore':
        return this.restore(c);
      case 'purge':
        return this.purge(c);
    }
  }

  // ---------------------------------------------------------------- staging helpers

  private stage(kind: EntityKind, before: Entity | null, after: Entity | null): void {
    const id = (after ?? before)?.id;
    if (!id) throw new DomainError('INVARIANT', 'error.internal');
    const existing = this.staged.get(id);
    // Keep the original `before` when a record is touched twice within one command.
    this.staged.set(id, { kind, id, before: existing ? existing.before : before, after });
    if (this.staged.size > LIMITS.batchSize) {
      throw new DomainError('LIMIT', 'error.batch.tooLarge', {
        details: { max: LIMITS.batchSize },
      });
    }
  }

  private async read<K extends EntityKind>(kind: K, id: string): Promise<EntityOf<K> | undefined> {
    const staged = this.staged.get(id);
    if (staged)
      return (staged.after?.kind === kind ? staged.after : undefined) as EntityOf<K> | undefined;
    const entity = await this.ctx.get(kind, id);
    if (entity && entity.workspaceId !== this.command.workspaceId) return undefined;
    return entity;
  }

  private async require<K extends EntityKind>(kind: K, id: string): Promise<EntityOf<K>> {
    const entity = await this.read(kind, id);
    if (!entity) throw new DomainError('NOT_FOUND', `error.${kind}.notFound`);
    return entity;
  }

  /** Children including staged changes, in rank order. */
  private async childrenOf<K extends EntityKind>(
    kind: K,
    parentId: string | null,
    options: { activeOnly: boolean },
  ): Promise<EntityOf<K>[]> {
    const fromStore = await this.ctx.children(kind, this.command.workspaceId, parentId);
    const byId = new Map<string, EntityOf<K>>(fromStore.map((e) => [e.id, e]));
    for (const change of this.staged.values()) {
      if (change.kind !== kind) continue;
      if (change.after && parentIdOf(change.after) === parentId) {
        byId.set(change.id, change.after as EntityOf<K>);
      } else {
        byId.delete(change.id);
      }
    }
    const list = [...byId.values()].filter((e) => !options.activeOnly || e.trashed === 0);
    return sortByRank(list) as EntityOf<K>[];
  }

  private base(id: string) {
    return {
      id,
      workspaceId: this.command.workspaceId,
      createdAt: this.now,
      updatedAt: this.now,
      deletedAt: null,
      trashed: 0 as const,
      deleteBatchId: null,
      schemaVersion: ENTITY_SCHEMA_VERSION,
      localRevision: 1,
      remoteVersion: null,
    };
  }

  private touch<E extends Entity>(entity: E, patch: Partial<E>): E {
    return { ...entity, ...patch, updatedAt: this.now, localRevision: entity.localRevision + 1 };
  }

  private async newId(kind: EntityKind, requested: string | undefined): Promise<string> {
    if (requested === undefined) return this.env.ids.newId();
    if (this.staged.has(requested) || (await this.ctx.get(kind, requested))) {
      throw new DomainError('VALIDATION', 'error.id.duplicate');
    }
    return requested;
  }

  /** True when the record and every ancestor exist and are not trashed. */
  private async isVisible(kind: EntityKind, entity: Entity | undefined): Promise<boolean> {
    let current: Entity | undefined = entity;
    let currentKind: EntityKind = kind;
    let guard = 0;
    while (current) {
      if (current.trashed === 1) return false;
      const parentId = parentIdOf(current);
      const parentKind = parentKindOf[currentKind];
      if (parentId === null || parentKind === null) return true;
      current = await this.read(parentKind, parentId);
      if (!current) return false;
      currentKind = parentKind;
      if (++guard > LIMITS.folderDepth + 4) throw new DomainError('INVARIANT', 'error.tree.cycle');
    }
    return false;
  }

  private async requireVisibleParent(kind: EntityKind, parentId: string | null): Promise<void> {
    const parentKind = parentKindOf[kind];
    if (parentId === null) {
      if (kind === 'page' || kind === 'block')
        throw new DomainError('VALIDATION', 'error.parent.required');
      return;
    }
    if (!parentKind) throw new DomainError('INVARIANT', 'error.internal');
    const parent = await this.read(parentKind, parentId);
    if (!parent) throw new DomainError('NOT_FOUND', `error.${parentKind}.notFound`);
    if (!(await this.isVisible(parentKind, parent))) {
      throw new DomainError('INVARIANT', 'error.parent.trashed');
    }
  }

  /**
   * Allocates a rank for an item placed among the active siblings of `parentId`. If ranks grew too
   * long, all siblings are re-ranked evenly inside the same mutation (explicit atomic rebalance).
   */
  private async allocateRank(
    kind: EntityKind,
    parentId: string | null,
    placement: Placement,
    movingId: string,
  ): Promise<string> {
    const siblings = (await this.childrenOf(kind, parentId, { activeOnly: true })).filter(
      (s) => s.id !== movingId,
    ) as (Entity & { rank: string })[];
    let index: number;
    switch (placement.kind) {
      case 'start':
        index = 0;
        break;
      case 'end':
        index = siblings.length;
        break;
      case 'before':
      case 'after': {
        const anchor = siblings.findIndex((s) => s.id === placement.id);
        if (anchor < 0) throw new DomainError('VALIDATION', 'error.placement.anchorMissing');
        index = placement.kind === 'before' ? anchor : anchor + 1;
        break;
      }
    }
    const before = siblings[index - 1]?.rank ?? null;
    const after = siblings[index]?.rank ?? null;
    const rank = rankBetween(before, after);
    if (!needsRebalance(rank)) return rank;

    const ordered: ((Entity & { rank: string }) | null)[] = [...siblings];
    ordered.splice(index, 0, null); // null marks the slot of the item being placed
    const fresh = ranksBetween(null, null, ordered.length);
    let assigned = '';
    ordered.forEach((sibling, i) => {
      const value = fresh[i] as string;
      if (sibling === null) assigned = value;
      else if (sibling.rank !== value)
        this.stage(kind, sibling, this.touch(sibling, { rank: value }));
    });
    return assigned;
  }

  private checkPayloadSize(payload: JsonValue): void {
    if (jsonByteLength(payload) > LIMITS.blockPayloadBytes) {
      throw new DomainError('LIMIT', 'error.block.payloadTooLarge', {
        details: { maxBytes: LIMITS.blockPayloadBytes },
      });
    }
  }

  private blockPayload(type: string, payload: unknown): JsonValue {
    const { blocks } = this.env;
    if (!blocks.isKnown(type)) throw new DomainError('UNSUPPORTED', 'error.block.unknownType');
    const value =
      payload === undefined ? blocks.createDefault(type) : blocks.validate(type, payload);
    this.checkPayloadSize(value);
    return value;
  }

  // ---------------------------------------------------------------- commands

  private async folderDepth(folderId: string | null): Promise<number> {
    let depth = 0;
    let current = folderId;
    while (current !== null) {
      const folder = await this.require('folder', current);
      current = folder.parentFolderId;
      if (++depth > LIMITS.folderDepth) break;
    }
    return depth;
  }

  private async createFolder(c: CommandOf<'createFolder'>): Promise<void> {
    await this.requireVisibleParent('folder', c.parentFolderId);
    if ((await this.folderDepth(c.parentFolderId)) >= LIMITS.folderDepth) {
      throw new DomainError('LIMIT', 'error.folder.tooDeep', {
        details: { max: LIMITS.folderDepth },
      });
    }
    const id = await this.newId('folder', c.id);
    const folder: Folder = {
      ...this.base(id),
      kind: 'folder',
      parentFolderId: c.parentFolderId,
      name: c.name,
      rank: await this.allocateRank('folder', c.parentFolderId, c.placement, id),
    };
    this.stage('folder', null, folder);
    this.primary = { kind: 'folder', id };
  }

  private async createNotebook(c: CommandOf<'createNotebook'>): Promise<void> {
    await this.requireVisibleParent('notebook', c.folderId);
    const id = await this.newId('notebook', c.id);
    const notebook: Notebook = {
      ...this.base(id),
      kind: 'notebook',
      folderId: c.folderId,
      title: c.title,
      icon: c.icon,
      rank: await this.allocateRank('notebook', c.folderId, c.placement, id),
    };
    this.stage('notebook', null, notebook);
    this.primary = { kind: 'notebook', id };
  }

  private async createPage(c: CommandOf<'createPage'>): Promise<void> {
    await this.requireVisibleParent('page', c.notebookId);
    const id = await this.newId('page', c.id);
    const page: Page = {
      ...this.base(id),
      kind: 'page',
      notebookId: c.notebookId,
      title: c.title,
      rank: await this.allocateRank('page', c.notebookId, c.placement, id),
      archivedAt: null,
      templateId: null,
    };
    this.stage('page', null, page);
    for (const spec of c.blocks) {
      await this.insertBlock(id, spec.type, spec.payload, { kind: 'end' }, spec.id);
    }
    this.primary = { kind: 'page', id };
  }

  private async insertBlock(
    pageId: string,
    type: string,
    payload: unknown,
    placement: Placement,
    requestedId: string | undefined,
  ): Promise<Block> {
    const id = await this.newId('block', requestedId);
    const block: Block = {
      ...this.base(id),
      kind: 'block',
      pageId,
      type,
      payloadVersion: this.env.blocks.currentVersion(type),
      payload: this.blockPayload(type, payload),
      rank: await this.allocateRank('block', pageId, placement, id),
      collapsed: false,
    };
    this.stage('block', null, block);
    return block;
  }

  private async rename(c: CommandOf<'rename'>): Promise<void> {
    const entity = await this.require(c.kind, c.id);
    if (entity.trashed === 1) throw new DomainError('INVARIANT', 'error.entity.trashed');
    if (entity.kind === 'folder') {
      if (c.name.length === 0) throw new DomainError('VALIDATION', 'error.name.required');
      if (entity.name !== c.name)
        this.stage('folder', entity, this.touch(entity, { name: c.name }));
    } else if (entity.kind === 'notebook') {
      if (c.name.length === 0) throw new DomainError('VALIDATION', 'error.name.required');
      if (entity.title !== c.name)
        this.stage('notebook', entity, this.touch(entity, { title: c.name }));
    } else if (entity.kind === 'page') {
      if (entity.title !== c.name)
        this.stage('page', entity, this.touch(entity, { title: c.name }));
    }
    this.primary = { kind: c.kind, id: c.id };
  }

  private async move(c: CommandOf<'move'>): Promise<void> {
    const entity = await this.require(c.kind, c.id);
    if (entity.trashed === 1) throw new DomainError('INVARIANT', 'error.entity.trashed');
    await this.requireVisibleParent(c.kind, c.parentId);

    if (c.kind === 'folder') {
      // A folder can be neither its own parent nor moved below one of its descendants.
      let cursor = c.parentId;
      while (cursor !== null) {
        if (cursor === c.id) throw new DomainError('INVARIANT', 'error.folder.cycle');
        const ancestor = await this.require('folder', cursor);
        cursor = ancestor.parentFolderId;
      }
      const subtreeDepth = await this.subtreeFolderDepth(c.id);
      if ((await this.folderDepth(c.parentId)) + subtreeDepth > LIMITS.folderDepth) {
        throw new DomainError('LIMIT', 'error.folder.tooDeep', {
          details: { max: LIMITS.folderDepth },
        });
      }
    }

    const rank = await this.allocateRank(c.kind, c.parentId, c.placement, c.id);
    const current = (await this.require(c.kind, c.id)) as Entity; // may have been re-ranked
    const field = {
      folder: 'parentFolderId',
      notebook: 'folderId',
      page: 'notebookId',
      block: 'pageId',
    }[c.kind];
    this.stage(
      c.kind,
      current,
      this.touch(current, { [field]: c.parentId, rank } as Partial<Entity>),
    );
    this.primary = { kind: c.kind, id: c.id };
  }

  private async subtreeFolderDepth(folderId: string): Promise<number> {
    const children = await this.childrenOf('folder', folderId, { activeOnly: false });
    let max = 0;
    for (const child of children) max = Math.max(max, await this.subtreeFolderDepth(child.id));
    return max + 1;
  }

  private async createBlock(c: CommandOf<'createBlock'>): Promise<void> {
    await this.requireVisibleParent('block', c.pageId);
    const block = await this.insertBlock(c.pageId, c.blockType, c.payload, c.placement, c.id);
    this.primary = { kind: 'block', id: block.id };
  }

  private async updateBlock(c: CommandOf<'updateBlock'>): Promise<void> {
    const block = await this.require('block', c.id);
    if (block.trashed === 1) throw new DomainError('INVARIANT', 'error.entity.trashed');
    if (block.localRevision !== c.expectedRevision) {
      throw new DomainError('CONFLICT', 'error.block.revisionMismatch', {
        details: { expected: c.expectedRevision, actual: block.localRevision },
      });
    }
    const payload = this.blockPayload(block.type, c.payload);
    this.stage(
      'block',
      block,
      this.touch(block, { payload, payloadVersion: this.env.blocks.currentVersion(block.type) }),
    );
    this.primary = { kind: 'block', id: block.id };
  }

  private async setBlockCollapsed(c: CommandOf<'setBlockCollapsed'>): Promise<void> {
    const block = await this.require('block', c.id);
    if (block.collapsed !== c.collapsed)
      this.stage('block', block, this.touch(block, { collapsed: c.collapsed }));
    this.primary = { kind: 'block', id: block.id };
  }

  private async duplicateBlock(c: CommandOf<'duplicateBlock'>): Promise<void> {
    const source = await this.require('block', c.id);
    if (source.trashed === 1) throw new DomainError('INVARIANT', 'error.entity.trashed');
    const payload = this.env.blocks.isKnown(source.type)
      ? this.env.blocks.remapReferences(source.type, source.payload, () => undefined)
      : source.payload;
    const id = this.env.ids.newId();
    const copy: Block = {
      ...this.base(id),
      kind: 'block',
      pageId: source.pageId,
      type: source.type,
      payloadVersion: source.payloadVersion,
      payload,
      rank: await this.allocateRank('block', source.pageId, { kind: 'after', id: source.id }, id),
      collapsed: source.collapsed,
    };
    this.stage('block', null, copy);
    this.primary = { kind: 'block', id };
  }

  private async duplicatePage(c: CommandOf<'duplicatePage'>): Promise<void> {
    const source = await this.require('page', c.id);
    if (source.trashed === 1) throw new DomainError('INVARIANT', 'error.entity.trashed');
    const blocks = await this.childrenOf('block', source.id, { activeOnly: true });

    const idMap = new Map<string, string>([[source.id, this.env.ids.newId()]]);
    for (const block of blocks) idMap.set(block.id, this.env.ids.newId());
    const map = (id: string) => idMap.get(id);
    const newPageId = idMap.get(source.id) as string;

    const page: Page = {
      ...this.base(newPageId),
      kind: 'page',
      notebookId: source.notebookId,
      title: c.title,
      rank: await this.allocateRank(
        'page',
        source.notebookId,
        { kind: 'after', id: source.id },
        newPageId,
      ),
      archivedAt: null,
      templateId: source.templateId,
    };
    this.stage('page', null, page);
    const ranks = ranksBetween(null, null, blocks.length);
    blocks.forEach((block, i) => {
      const id = idMap.get(block.id) as string;
      const payload = this.env.blocks.isKnown(block.type)
        ? this.env.blocks.remapReferences(block.type, block.payload, map)
        : block.payload;
      this.stage('block', null, {
        ...this.base(id),
        kind: 'block',
        pageId: newPageId,
        type: block.type,
        payloadVersion: block.payloadVersion,
        payload,
        rank: ranks[i] as string,
        collapsed: block.collapsed,
      });
    });
    // Verify the mapping before commit: every copied block must land on the new page.
    for (const change of this.staged.values()) {
      if (
        change.kind === 'block' &&
        change.before === null &&
        (change.after as Block).pageId !== newPageId
      ) {
        throw new DomainError('INVARIANT', 'error.duplicate.mapping');
      }
    }
    this.primary = { kind: 'page', id: newPageId };
  }

  private async collectActiveSubtree(
    kind: EntityKind,
    root: Entity,
    out: { kind: EntityKind; entity: Entity }[],
  ) {
    out.push({ kind, entity: root });
    for (const childKind of childKindsOf[kind]) {
      const children = await this.childrenOf(childKind, root.id, { activeOnly: true });
      for (const child of children) await this.collectActiveSubtree(childKind, child, out);
    }
  }

  private async trash(c: CommandOf<'trash'>): Promise<void> {
    const root = await this.require(c.kind, c.id);
    if (root.trashed === 1) throw new DomainError('INVARIANT', 'error.entity.trashed');
    const members: { kind: EntityKind; entity: Entity }[] = [];
    await this.collectActiveSubtree(c.kind, root, members);
    if (members.length > LIMITS.batchSize) {
      throw new DomainError('LIMIT', 'error.batch.tooLarge', {
        details: { max: LIMITS.batchSize },
      });
    }
    const batchId = this.env.ids.newId();
    for (const { kind, entity } of members) {
      this.stage(
        kind,
        entity,
        this.touch(entity, { deletedAt: this.now, trashed: 1, deleteBatchId: batchId }),
      );
    }
    this.batchId = batchId;
    this.primary = { kind: c.kind, id: c.id };
  }

  private async restore(c: CommandOf<'restore'>): Promise<void> {
    const members = (await this.ctx.byBatch(c.workspaceId, c.batchId)).filter(
      (e) => e.deleteBatchId === c.batchId && e.trashed === 1,
    );
    if (members.length === 0) throw new DomainError('NOT_FOUND', 'error.trash.batchNotFound');
    const memberIds = new Set(members.map((m) => m.id));
    const roots = members.filter((m) => {
      const parentId = parentIdOf(m);
      return parentId === null || !memberIds.has(parentId);
    });
    if (roots.length !== 1) throw new DomainError('INVARIANT', 'error.trash.batchShape');
    const root = roots[0] as Entity;

    let newParent: { id: string | null; changed: boolean } = {
      id: parentIdOf(root),
      changed: false,
    };
    const parentKind = parentKindOf[root.kind];
    const originalParentOk =
      newParent.id === null ||
      (parentKind !== null &&
        (await this.isVisible(parentKind, await this.read(parentKind, newParent.id))));
    if (!originalParentOk) {
      if (c.targetParentId === undefined) {
        throw new DomainError('CONFLICT', 'error.restore.parentMissing', {
          details: { kind: root.kind },
        });
      }
      await this.requireVisibleParent(root.kind, c.targetParentId);
      newParent = { id: c.targetParentId, changed: true };
    }

    for (const member of members) {
      const restored = this.touch(member, { deletedAt: null, trashed: 0, deleteBatchId: null });
      this.stage(member.kind, member, restored);
    }
    if (newParent.changed) {
      const rank = await this.allocateRank(root.kind, newParent.id, { kind: 'end' }, root.id);
      const staged = this.staged.get(root.id)?.after as Entity;
      const field = {
        folder: 'parentFolderId',
        notebook: 'folderId',
        page: 'notebookId',
        block: 'pageId',
      }[root.kind];
      this.stage(root.kind, staged, { ...staged, [field]: newParent.id, rank } as Entity);
    }
    this.primary = { kind: root.kind, id: root.id };
  }

  private async purge(c: CommandOf<'purge'>): Promise<void> {
    const members = (await this.ctx.byBatch(c.workspaceId, c.batchId)).filter(
      (e) => e.deleteBatchId === c.batchId && e.trashed === 1,
    );
    if (members.length === 0) throw new DomainError('NOT_FOUND', 'error.trash.batchNotFound');
    // Children trashed earlier by another batch would be orphaned; purge them with this batch.
    const all: { kind: EntityKind; entity: Entity }[] = [];
    const seen = new Set<string>();
    const visit = async (kind: EntityKind, entity: Entity) => {
      if (seen.has(entity.id)) return;
      seen.add(entity.id);
      all.push({ kind, entity });
      for (const childKind of childKindsOf[kind]) {
        for (const child of await this.childrenOf(childKind, entity.id, { activeOnly: false })) {
          await visit(childKind, child);
        }
      }
    };
    for (const m of members) await visit(m.kind, m);
    for (const { kind, entity } of all) this.stage(kind, entity, null);
  }
}
