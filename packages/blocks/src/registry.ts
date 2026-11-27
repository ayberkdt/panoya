import { DomainError, type Block, type BlockCatalog, type JsonValue } from '@panoya/domain';
import type { z } from 'zod';

export type BlockCategory = 'text' | 'productivity' | 'data' | 'scientific';

/** Reference to a typed output of another block (used by the compute engine in G4). */
export interface ValueRef {
  blockId: string;
  outputKey: string;
}

/**
 * Payload types must be JSON-serialisable; the schema output is trusted as such at this boundary.
 */
export interface BlockDefinition<P = unknown> {
  /** Stable, namespaced-safe identifier stored in every block record. */
  type: string;
  currentVersion: number;
  category: BlockCategory;
  schema: z.ZodType<P>;
  createDefault(): P;
  /** Upgrade an older payload. Default: validate as current. */
  migrate?(raw: unknown, fromVersion: number): P;
  toPlainText(payload: P): string;
  toMarkdown(payload: P): string;
  references?(payload: P): ValueRef[];
  /** Ids of pages this block links to (backlinks, duplicate remap). */
  pageRefs?(payload: P): string[];
  remapReferences?(payload: P, map: (id: string) => string | undefined): P;
}

export type ResolvedBlock =
  | { status: 'ok'; type: string; payload: unknown; definition: BlockDefinition }
  /** Type not registered in this app version: preserved, read-only, exportable. */
  | { status: 'unknown'; type: string; raw: JsonValue; reason: 'unknownType' | 'futureVersion' }
  /** Registered type but payload failed validation/migration: preserved, read-only. */
  | { status: 'invalid'; type: string; raw: JsonValue; definition: BlockDefinition };

export class BlockRegistry implements BlockCatalog {
  private readonly definitions = new Map<string, BlockDefinition>();

  register<P>(definition: BlockDefinition<P>): this {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Block type already registered: ${definition.type}`);
    }
    this.definitions.set(definition.type, definition as unknown as BlockDefinition);
    return this;
  }

  get(type: string): BlockDefinition | undefined {
    return this.definitions.get(type);
  }

  list(): BlockDefinition[] {
    return [...this.definitions.values()];
  }

  isKnown(type: string): boolean {
    return this.definitions.has(type);
  }

  currentVersion(type: string): number {
    return this.require(type).currentVersion;
  }

  createDefault(type: string): JsonValue {
    return this.require(type).createDefault() as JsonValue;
  }

  validate(type: string, payload: unknown): JsonValue {
    const result = this.require(type).schema.safeParse(payload);
    if (!result.success) {
      const issue = result.error.issues[0];
      throw new DomainError('VALIDATION', `error.block.${type}.invalid`, {
        details: { path: issue?.path.join('.') ?? '', issue: issue?.message ?? '' },
      });
    }
    return result.data as JsonValue;
  }

  remapReferences(
    type: string,
    payload: JsonValue,
    map: (id: string) => string | undefined,
  ): JsonValue {
    const definition = this.require(type);
    const valid = definition.schema.safeParse(payload);
    if (!valid.success || !definition.remapReferences) return payload;
    return definition.remapReferences(valid.data, map) as JsonValue;
  }

  /** Resolve a stored block for display. Never throws and never alters the stored payload. */
  resolve(block: Pick<Block, 'type' | 'payload' | 'payloadVersion'>): ResolvedBlock {
    const definition = this.definitions.get(block.type);
    if (!definition)
      return { status: 'unknown', type: block.type, raw: block.payload, reason: 'unknownType' };
    if (block.payloadVersion > definition.currentVersion) {
      return { status: 'unknown', type: block.type, raw: block.payload, reason: 'futureVersion' };
    }
    try {
      const payload =
        block.payloadVersion < definition.currentVersion && definition.migrate
          ? definition.migrate(block.payload, block.payloadVersion)
          : definition.schema.parse(block.payload);
      return { status: 'ok', type: block.type, payload, definition };
    } catch {
      return { status: 'invalid', type: block.type, raw: block.payload, definition };
    }
  }

  /** Plain text for search/copy; unknown or invalid blocks fall back to visible JSON strings. */
  plainText(block: Pick<Block, 'type' | 'payload' | 'payloadVersion'>): string {
    const resolved = this.resolve(block);
    if (resolved.status === 'ok') return resolved.definition.toPlainText(resolved.payload);
    return fallbackText(resolved.raw);
  }

  markdown(block: Pick<Block, 'type' | 'payload' | 'payloadVersion'>): string {
    const resolved = this.resolve(block);
    if (resolved.status === 'ok') return resolved.definition.toMarkdown(resolved.payload);
    return fallbackText(resolved.raw);
  }

  private require(type: string): BlockDefinition {
    const definition = this.definitions.get(type);
    if (!definition) throw new DomainError('UNSUPPORTED', 'error.block.unknownType');
    return definition;
  }
}

/** Collects string leaves of an arbitrary JSON value; safe text fallback for unknown blocks. */
export function fallbackText(value: JsonValue): string {
  const parts: string[] = [];
  const walk = (v: JsonValue) => {
    if (typeof v === 'string') {
      if (v.trim() !== '') parts.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return parts.join('\n');
}
