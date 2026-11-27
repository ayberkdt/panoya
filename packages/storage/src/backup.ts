import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import type { BlockRegistry } from '@panoya/blocks';
import { pageToMarkdown } from '@panoya/blocks';
import {
  DomainError,
  ENTITY_SCHEMA_VERSION,
  entityKinds,
  parentField,
  sortByRank,
  validateEntity,
  workspaceSchema,
  type Block,
  type Dataset,
  type DatasetRow,
  type Entity,
  type EntityKind,
  type Folder,
  type IdSource,
  type Clock,
  type Notebook,
  type Page,
  type Workspace,
  cellText,
  cryptoIds,
  systemClock,
} from '@panoya/domain';
import type { StorageBackend } from './backend';
import { migrateEntity, migrateWorkspace } from './migrations';

// eslint-disable-next-line no-control-regex -- control characters are invalid in file names
const UNSAFE_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f]+/g;

/**
 * Independent backup (spec 17): a ZIP with a manifest, canonical JSON per entity kind and
 * human-readable Markdown. Restore validates paths, sizes, checksums and schemas before writing
 * anything, and writes the whole workspace in one transaction (failure leaves the DB untouched).
 */
export const BACKUP_FORMAT = 'panoya-backup';
export const BACKUP_FORMAT_VERSION = 1;

export const BACKUP_LIMITS = {
  zipBytes: 200 * 1024 * 1024,
  entries: 5000,
  totalUncompressed: 400 * 1024 * 1024,
  /** Per-entry compression ratio above which the archive is treated as a ZIP bomb. */
  maxRatio: 200,
} as const;

const KIND_FILES: Record<EntityKind, string> = {
  folder: 'entities/folders.json',
  notebook: 'entities/notebooks.json',
  page: 'entities/pages.json',
  block: 'entities/blocks.json',
  dataset: 'entities/datasets.json',
  datasetRow: 'entities/datasetRows.json',
};
const WORKSPACE_FILE = 'entities/workspace.json';

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  createdAt: string;
  appVersion: string;
  workspaceId: string;
  workspaceName: string;
  schemaVersion: number;
  counts: Record<EntityKind, number>;
  /** SHA-256 hex of every file except the manifest. */
  checksums: Record<string, string>;
  complete: boolean;
  /** History (undo log) and caches are never included. */
  excludes: string[];
}

export interface WorkspaceSnapshot {
  workspace: Workspace;
  entities: Record<EntityKind, Entity[]>;
}

export class BackupError extends DomainError {
  constructor(messageKey: string, details: Record<string, string | number> = {}) {
    super('VALIDATION', messageKey, { details });
    this.name = 'BackupError';
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = (globalThis as { crypto: Crypto }).crypto.subtle;
  const digest = await subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Consistent snapshot of one workspace taken inside a single read/write transaction. */
export async function snapshotWorkspace(
  backend: StorageBackend,
  workspaceId: string,
): Promise<WorkspaceSnapshot> {
  return backend.transaction(async (tx) => {
    const workspace = await tx.getWorkspace(workspaceId);
    if (!workspace) throw new DomainError('NOT_FOUND', 'error.workspace.notFound');
    const entities = {} as Record<EntityKind, Entity[]>;
    for (const kind of entityKinds) entities[kind] = await tx.listByWorkspace(kind, workspaceId);
    return { workspace, entities };
  });
}

// ------------------------------------------------------------------------------- export

export async function exportBackup(
  backend: StorageBackend,
  registry: BlockRegistry,
  workspaceId: string,
  options: { appVersion: string; clock?: Clock },
): Promise<{ bytes: Uint8Array; manifest: BackupManifest }> {
  const snapshot = await snapshotWorkspace(backend, workspaceId);
  const files: Record<string, Uint8Array> = {};
  files[WORKSPACE_FILE] = strToU8(JSON.stringify(snapshot.workspace, null, 1));
  for (const kind of entityKinds)
    files[KIND_FILES[kind]] = strToU8(JSON.stringify(snapshot.entities[kind]));
  for (const [path, text] of readableMarkdown(snapshot, registry)) files[path] = strToU8(text);

  const checksums: Record<string, string> = {};
  for (const [path, bytes] of Object.entries(files)) checksums[path] = await sha256(bytes);
  const counts = Object.fromEntries(
    entityKinds.map((k) => [k, snapshot.entities[k].length]),
  ) as Record<EntityKind, number>;
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    createdAt: (options.clock ?? systemClock).now(),
    appVersion: options.appVersion,
    workspaceId,
    workspaceName: snapshot.workspace.name,
    schemaVersion: ENTITY_SCHEMA_VERSION,
    counts,
    checksums,
    complete: true,
    excludes: ['history', 'search-index', 'ui-state', 'auth'],
  };
  files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 1));
  return { bytes: zipSync(files, { level: 6 }), manifest };
}

/** Human-readable Markdown per page (lossy by design; JSON is the restorable source). */
function readableMarkdown(
  snapshot: WorkspaceSnapshot,
  registry: BlockRegistry,
): Map<string, string> {
  const active = <T extends Entity>(list: Entity[]) => list.filter((e) => e.trashed === 0) as T[];
  const folders = new Map(active<Folder>(snapshot.entities.folder).map((f) => [f.id, f]));
  const notebooks = new Map(active<Notebook>(snapshot.entities.notebook).map((n) => [n.id, n]));
  const blocksByPage = new Map<string, Block[]>();
  for (const b of active<Block>(snapshot.entities.block)) {
    const list = blocksByPage.get(b.pageId) ?? [];
    list.push(b);
    blocksByPage.set(b.pageId, list);
  }
  const datasets = new Map(active<Dataset>(snapshot.entities.dataset).map((d) => [d.id, d]));
  const rowsByDataset = new Map<string, DatasetRow[]>();
  for (const r of active<DatasetRow>(snapshot.entities.datasetRow)) {
    const list = rowsByDataset.get(r.datasetId) ?? [];
    list.push(r);
    rowsByDataset.set(r.datasetId, list);
  }
  const safe = (s: string) => s.replace(UNSAFE_FILENAME_CHARS, '_').trim().slice(0, 80) || '_';
  const out = new Map<string, string>();
  for (const page of active<Page>(snapshot.entities.page)) {
    const nb = notebooks.get(page.notebookId);
    if (!nb) continue;
    const segments: string[] = [];
    let cursor = nb.folderId;
    let broken = false;
    while (cursor) {
      const f = folders.get(cursor);
      if (!f) {
        broken = true;
        break;
      }
      segments.unshift(safe(f.name));
      cursor = f.parentFolderId;
    }
    if (broken) continue;
    const blocks = blocksByPage.get(page.id) ?? [];
    let md = pageToMarkdown(registry, page.title, blocks);
    for (const block of sortByRank(blocks)) {
      for (const datasetId of registry.datasetRefs(block.type, block.payload)) {
        const ds = datasets.get(datasetId);
        if (ds) md += `\n\n${datasetMarkdown(ds, sortByRank(rowsByDataset.get(ds.id) ?? []))}`;
      }
    }
    let path = ['readable', ...segments, safe(nb.title), `${safe(page.title || 'sayfa')}.md`].join(
      '/',
    );
    for (let n = 2; out.has(path); n++) path = path.replace(/(?: \(\d+\))?\.md$/, ` (${n}).md`);
    out.set(path, md);
  }
  return out;
}

function datasetMarkdown(dataset: Dataset, rows: DatasetRow[]): string {
  const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  const head = `| ${dataset.columns.map((c) => esc(c.label)).join(' | ')} |`;
  const sep = `| ${dataset.columns.map((c) => (c.type === 'text' || c.type === 'category' ? '---' : '---:')).join(' | ')} |`;
  const body = rows.map(
    (r) =>
      `| ${dataset.columns
        .map((c) => {
          const v = r.cells[c.id];
          if (!v || v.kind === 'missing') return '—';
          return esc(cellText(c, v));
        })
        .join(' | ')} |`,
  );
  return [dataset.title ? `**${esc(dataset.title)}**\n` : '', head, sep, ...body].join('\n');
}

// ------------------------------------------------------------------------------- inspect

export interface BackupPreview {
  manifest: BackupManifest;
  snapshot: WorkspaceSnapshot;
  counts: Record<EntityKind, number>;
  unknownBlockTypes: string[];
  /** Records whose parent is missing from the backup (restored but listed for the user). */
  danglingReferences: number;
}

const SAFE_PATH = /^(manifest\.json|entities\/[a-zA-Z]+\.json|readable\/[^\\]+\.md)$/;

function checkPath(name: string): void {
  if (name.endsWith('/')) return; // directory entries carry no data
  const unsafe =
    name.startsWith('/') ||
    name.includes('\\') ||
    /(^|\/)\.\.(\/|$)/.test(name) ||
    /^[a-zA-Z]:/.test(name) ||
    !SAFE_PATH.test(name);
  if (unsafe) throw new BackupError('error.backup.unsafePath', { path: name.slice(0, 120) });
}

/** Validates an archive without writing anything. Throws BackupError on any problem. */
export async function inspectBackup(
  bytes: Uint8Array,
  registry: BlockRegistry,
): Promise<BackupPreview> {
  if (bytes.byteLength > BACKUP_LIMITS.zipBytes) throw new BackupError('error.backup.tooLarge');
  let entries = 0;
  let total = 0;
  let unzipped: Unzipped;
  try {
    unzipped = unzipSync(bytes, {
      filter: (file) => {
        entries++;
        checkPath(file.name);
        if (entries > BACKUP_LIMITS.entries) throw new BackupError('error.backup.tooManyEntries');
        total += file.originalSize;
        if (total > BACKUP_LIMITS.totalUncompressed) throw new BackupError('error.backup.tooLarge');
        if (
          file.size > 0 &&
          file.originalSize / file.size > BACKUP_LIMITS.maxRatio &&
          file.originalSize > 1024 * 1024
        ) {
          throw new BackupError('error.backup.bomb');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError('error.backup.notZip');
  }
  // Header sizes can lie; re-check what was actually inflated.
  const inflated = Object.values(unzipped).reduce((n, b) => n + b.byteLength, 0);
  if (inflated > BACKUP_LIMITS.totalUncompressed) throw new BackupError('error.backup.tooLarge');

  const manifestBytes = unzipped['manifest.json'];
  if (!manifestBytes) throw new BackupError('error.backup.noManifest');
  const manifest = parseJson(manifestBytes, 'manifest.json') as BackupManifest;
  if (manifest.format !== BACKUP_FORMAT) throw new BackupError('error.backup.notPanoya');
  if (
    typeof manifest.formatVersion !== 'number' ||
    manifest.formatVersion > BACKUP_FORMAT_VERSION
  ) {
    throw new BackupError('error.backup.newerFormat', { version: String(manifest.formatVersion) });
  }
  if (manifest.schemaVersion > ENTITY_SCHEMA_VERSION) {
    throw new BackupError('error.backup.newerFormat', { version: String(manifest.schemaVersion) });
  }
  for (const [path, data] of Object.entries(unzipped)) {
    if (path === 'manifest.json' || path.endsWith('/')) continue;
    const expected = manifest.checksums?.[path];
    if (!expected) throw new BackupError('error.backup.unlistedFile', { path: path.slice(0, 120) });
    if ((await sha256(data)) !== expected)
      throw new BackupError('error.backup.checksum', { path: path.slice(0, 120) });
  }
  for (const path of Object.keys(manifest.checksums ?? {})) {
    if (!unzipped[path])
      throw new BackupError('error.backup.missingFile', { path: path.slice(0, 120) });
  }

  const wsBytes = unzipped[WORKSPACE_FILE];
  if (!wsBytes) throw new BackupError('error.backup.missingFile', { path: WORKSPACE_FILE });
  const wsParsed = workspaceSchema.safeParse(migrateWorkspace(parseJson(wsBytes, WORKSPACE_FILE)));
  if (!wsParsed.success)
    throw new BackupError('error.backup.invalidRecord', { path: WORKSPACE_FILE });
  const workspace = wsParsed.data;

  const entities = {} as Record<EntityKind, Entity[]>;
  const ids = new Set<string>();
  for (const kind of entityKinds) {
    const fileBytes = unzipped[KIND_FILES[kind]];
    const raw = fileBytes ? parseJson(fileBytes, KIND_FILES[kind]) : [];
    if (!Array.isArray(raw))
      throw new BackupError('error.backup.invalidRecord', { path: KIND_FILES[kind] });
    entities[kind] = raw.map((record, index) => {
      let entity: Entity;
      try {
        entity = validateEntity(migrateEntity(record));
      } catch {
        throw new BackupError('error.backup.invalidRecord', {
          path: `${KIND_FILES[kind]}#${index}`,
        });
      }
      if (entity.kind !== kind || entity.workspaceId !== workspace.id) {
        throw new BackupError('error.backup.invalidRecord', {
          path: `${KIND_FILES[kind]}#${index}`,
        });
      }
      if (ids.has(entity.id)) throw new BackupError('error.backup.duplicateId');
      ids.add(entity.id);
      return entity;
    });
    if (manifest.counts?.[kind] !== undefined && manifest.counts[kind] !== entities[kind].length) {
      throw new BackupError('error.backup.countMismatch', { kind });
    }
  }

  let dangling = 0;
  for (const kind of entityKinds) {
    for (const e of entities[kind]) {
      const field = parentField[kind];
      const parent = field ? (e as unknown as Record<string, string | null>)[field] : null;
      if (parent && !ids.has(parent)) dangling++;
    }
  }
  const unknownBlockTypes = [
    ...new Set(
      (entities.block as Block[]).filter((b) => !registry.isKnown(b.type)).map((b) => b.type),
    ),
  ];
  const counts = Object.fromEntries(entityKinds.map((k) => [k, entities[k].length])) as Record<
    EntityKind,
    number
  >;
  return {
    manifest,
    snapshot: { workspace, entities },
    counts,
    unknownBlockTypes,
    danglingReferences: dangling,
  };
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(strFromU8(bytes));
  } catch {
    throw new BackupError('error.backup.invalidJson', { path });
  }
}

// ------------------------------------------------------------------------------- restore

/**
 * Restores into a NEW workspace. Ids are kept when none collide with existing records;
 * otherwise every id (workspace, records, trash batches, internal references) is remapped
 * consistently. One transaction: either everything is written or nothing.
 */
export async function restoreBackup(
  backend: StorageBackend,
  registry: BlockRegistry,
  preview: BackupPreview,
  options: { name: string; ids?: IdSource; clock?: Clock },
): Promise<{ workspaceId: string; remapped: boolean }> {
  const ids = options.ids ?? cryptoIds;
  const now = (options.clock ?? systemClock).now();
  const { snapshot } = preview;
  return backend.transaction(async (tx) => {
    let collision = (await tx.getWorkspace(snapshot.workspace.id)) !== undefined;
    for (const kind of entityKinds) {
      if (collision) break;
      for (const e of snapshot.entities[kind]) {
        if (await tx.get(kind, e.id)) {
          collision = true;
          break;
        }
      }
    }
    const map = new Map<string, string>();
    const remap = (id: string) => {
      if (!collision) return id;
      let next = map.get(id);
      if (!next) {
        next = ids.newId();
        map.set(id, next);
      }
      return next;
    };
    const workspaceId = remap(snapshot.workspace.id);
    await tx.putWorkspace({
      ...snapshot.workspace,
      id: workspaceId,
      name: options.name,
      updatedAt: now,
    });
    // First pass assigns ids to every record so references to later records resolve.
    if (collision)
      for (const kind of entityKinds) for (const e of snapshot.entities[kind]) remap(e.id);
    const lookup = (id: string) => (collision ? map.get(id) : id);
    for (const kind of entityKinds) {
      for (const entity of snapshot.entities[kind]) {
        const copy = {
          ...entity,
          id: remap(entity.id),
          workspaceId,
          remoteVersion: null,
        } as Record<string, unknown>;
        const field = parentField[kind];
        if (field && typeof copy[field] === 'string') copy[field] = remap(copy[field] as string);
        if (typeof copy.deleteBatchId === 'string') copy.deleteBatchId = remap(copy.deleteBatchId);
        if (entity.kind === 'block' && collision && registry.isKnown(entity.type)) {
          copy.payload = registry.remapReferences(entity.type, entity.payload, lookup);
        }
        await tx.put(validateEntity(copy));
      }
    }
    return { workspaceId, remapped: collision };
  });
}

/** Canonical, id-independent view of a snapshot for semantic round-trip comparison. */
export function semanticSnapshot(snapshot: WorkspaceSnapshot): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const kind of entityKinds) {
    out[kind] = snapshot.entities[kind]
      .map((e) => {
        const {
          id: _id,
          workspaceId: _ws,
          remoteVersion: _rv,
          ...rest
        } = e as unknown as Record<string, unknown>;
        void _id;
        void _ws;
        void _rv;
        const field = parentField[kind];
        if (field) delete rest[field];
        delete rest.deleteBatchId;
        if (kind === 'block' && rest.payload && typeof rest.payload === 'object') {
          const { datasetId: _ds, ...payload } = rest.payload as Record<string, unknown>;
          void _ds;
          rest.payload = payload;
        }
        return JSON.stringify(rest);
      })
      .sort();
  }
  return out;
}
