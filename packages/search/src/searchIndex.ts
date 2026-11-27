import { exactKey, fold, foldWithMap, tokensWithOffsets } from './fold';
import { hasCriteria, parseQuery, type ParsedQuery } from './query';

export type SearchField = 'title' | 'tag' | 'url' | 'subject' | 'content';

/** One searchable unit: a container title or one block's text. */
export interface SearchDoc {
  id: string;
  kind: 'folder' | 'notebook' | 'page' | 'block';
  /** Page to open for page/block docs. */
  pageId: string | null;
  /** Block type for block docs (`type:` filter); entity kind otherwise. */
  type: string;
  title: string;
  fields: Partial<Record<Exclude<SearchField, 'title'>, string>>;
  tags: string[];
  /** Names of the ancestors, root first (breadcrumb and `in:` filter). */
  path: string[];
  updatedAt: string;
  /** Entity revision the doc was built from; unchanged revisions are skipped on update. */
  revision: number;
}

export interface SearchHit {
  doc: SearchDoc;
  score: number;
  field: SearchField;
  snippet: { text: string; highlights: [number, number][] } | null;
}

const FIELD_WEIGHT: Record<SearchField, number> = {
  title: 6,
  tag: 4,
  url: 3,
  subject: 3,
  content: 1,
};

interface Posting {
  /** Bitmask of fields containing the token. */
  fields: number;
}
const FIELD_BIT: Record<SearchField, number> = {
  title: 1,
  tag: 2,
  url: 4,
  subject: 8,
  content: 16,
};

/**
 * In-memory inverted index derived from committed records (spec 09). Disposable: it can always
 * be rebuilt from storage, and stores nothing that is not in the canonical data.
 */
export class SearchIndex {
  private readonly docs = new Map<string, SearchDoc>();
  private readonly postings = new Map<string, Map<string, Posting>>();
  private readonly docTokens = new Map<string, string[]>();
  private sortedTokens: string[] = [];
  private dirty = false;

  get size(): number {
    return this.docs.size;
  }

  has(id: string, revision?: number): boolean {
    const doc = this.docs.get(id);
    return doc !== undefined && (revision === undefined || doc.revision === revision);
  }

  upsert(doc: SearchDoc): void {
    const existing = this.docs.get(doc.id);
    if (
      existing &&
      existing.revision === doc.revision &&
      existing.path.join('\u0000') === doc.path.join('\u0000')
    )
      return;
    if (existing) this.remove(doc.id);
    this.docs.set(doc.id, doc);
    const tokens = new Map<string, number>();
    const add = (field: SearchField, text: string | undefined) => {
      if (!text) return;
      for (const { token } of tokensWithOffsets(fold(text)))
        tokens.set(token, (tokens.get(token) ?? 0) | FIELD_BIT[field]);
    };
    add('title', doc.title);
    for (const tag of doc.tags) add('tag', tag);
    add('url', doc.fields.url);
    add('subject', doc.fields.subject);
    add('content', doc.fields.content);
    add('tag', doc.fields.tag);
    for (const [token, fields] of tokens) {
      let map = this.postings.get(token);
      if (!map) {
        map = new Map();
        this.postings.set(token, map);
        this.dirty = true;
      }
      map.set(doc.id, { fields });
    }
    this.docTokens.set(doc.id, [...tokens.keys()]);
  }

  remove(id: string): void {
    const tokens = this.docTokens.get(id);
    if (tokens) {
      for (const token of tokens) {
        const map = this.postings.get(token);
        map?.delete(id);
        if (map && map.size === 0) {
          this.postings.delete(token);
          this.dirty = true;
        }
      }
    }
    this.docTokens.delete(id);
    this.docs.delete(id);
  }

  /** Remove every doc not in `keep` (used after a full rebuild pass). */
  retainOnly(keep: ReadonlySet<string>): void {
    for (const id of [...this.docs.keys()]) if (!keep.has(id)) this.remove(id);
  }

  private tokensWithPrefix(prefix: string): string[] {
    if (this.dirty) {
      this.sortedTokens = [...this.postings.keys()].sort();
      this.dirty = false;
    }
    const list = this.sortedTokens;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((list[mid] as string) < prefix) lo = mid + 1;
      else hi = mid;
    }
    const out: string[] = [];
    for (let i = lo; i < list.length && (list[i] as string).startsWith(prefix); i++)
      out.push(list[i] as string);
    return out;
  }

  search(
    input: string | ParsedQuery,
    options: { limit?: number } = {},
  ): { hits: SearchHit[]; query: ParsedQuery } {
    const query = typeof input === 'string' ? parseQuery(input) : input;
    if (!hasCriteria(query)) return { hits: [], query };
    const limit = options.limit ?? 50;

    // Candidate docs: AND over terms; every term matches token prefixes.
    let candidates: Map<string, { score: number; fields: number }> | null = null;
    for (const term of query.terms) {
      const matches = new Map<string, { score: number; fields: number }>();
      for (const token of this.tokensWithPrefix(term)) {
        const exact = token === term;
        for (const [docId, posting] of this.postings.get(token) ?? []) {
          let best = 0;
          for (const field of Object.keys(FIELD_BIT) as SearchField[]) {
            if (posting.fields & FIELD_BIT[field])
              best = Math.max(best, FIELD_WEIGHT[field] * (exact ? 2 : 1));
          }
          const prev = matches.get(docId);
          if (!prev || prev.score < best)
            matches.set(docId, { score: best, fields: (prev?.fields ?? 0) | posting.fields });
          else prev.fields |= posting.fields;
        }
      }
      if (candidates === null) candidates = matches;
      else {
        const next = new Map<string, { score: number; fields: number }>();
        for (const [id, m] of matches) {
          const prev = candidates.get(id);
          if (prev) next.set(id, { score: prev.score + m.score, fields: prev.fields | m.fields });
        }
        candidates = next;
      }
      if (candidates.size === 0) break;
    }
    const pool: Iterable<[string, { score: number; fields: number }]> =
      candidates ??
      [...this.docs.keys()].map(
        (id) => [id, { score: 0, fields: 0 }] as [string, { score: number; fields: number }],
      );

    const hits: SearchHit[] = [];
    const exactQuery = query.terms.length ? exactKey(query.text) : '';
    for (const [id, m] of pool) {
      const doc = this.docs.get(id);
      if (!doc || !matchesFilters(doc, query)) continue;
      let score = m.score;
      const titleFolded = fold(doc.title);
      if (query.text && titleFolded === query.text)
        score += 1000; // exact title
      else if (query.text && titleFolded.startsWith(query.text)) score += 500; // title prefix
      if (exactQuery && exactKey(doc.title).includes(exactQuery)) score += 50; // exact spelling (accents) wins ties
      score += recencyBonus(doc.updatedAt);
      const field = bestField(m.fields);
      hits.push({
        doc,
        score,
        field,
        snippet: query.terms.length ? snippetFor(doc, field, query.terms) : null,
      });
    }
    hits.sort((a, b) => b.score - a.score || (a.doc.id < b.doc.id ? -1 : 1));
    return { hits: hits.slice(0, limit), query };
  }
}

function bestField(mask: number): SearchField {
  for (const f of ['title', 'tag', 'url', 'subject', 'content'] as const)
    if (mask & FIELD_BIT[f]) return f;
  return 'title';
}

/** Small tie-breaker in [0, 1): newer documents first among equal scores. */
function recencyBonus(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : (t / 1e13) % 1;
}

function matchesFilters(doc: SearchDoc, q: ParsedQuery): boolean {
  if (q.types.length && !q.types.includes(doc.type)) return false;
  if (q.tags.length) {
    const tags = doc.tags.map(fold);
    if (!q.tags.every((t) => tags.some((tag) => tag === t || tag.startsWith(t)))) return false;
  }
  if (q.inPath.length) {
    const path = doc.path.map(fold);
    if (!q.inPath.every((p) => path.some((name) => name.startsWith(p) || name.includes(p))))
      return false;
  }
  const day = doc.updatedAt.slice(0, 10);
  if (q.before && !(day < q.before)) return false;
  if (q.after && !(day > q.after)) return false;
  return true;
}

function snippetFor(doc: SearchDoc, field: SearchField, terms: string[]): SearchHit['snippet'] {
  const source =
    field === 'title'
      ? doc.title
      : field === 'tag'
        ? doc.tags.join(', ')
        : (doc.fields[field] ?? '');
  if (!source) return null;
  const { text: folded, map } = foldWithMap(source);
  const ranges: [number, number][] = [];
  for (const { token, start } of tokensWithOffsets(folded)) {
    if (!terms.some((t) => token.startsWith(t))) continue;
    const term = terms
      .filter((t) => token.startsWith(t))
      .sort((a, b) => b.length - a.length)[0] as string;
    const from = map[start] ?? 0;
    const lastFolded = start + term.length - 1;
    const to = (map[lastFolded] ?? from) + 1;
    ranges.push([from, Math.max(to, from + 1)]);
  }
  if (ranges.length === 0) return { text: source.slice(0, 120), highlights: [] };
  const first = ranges[0] as [number, number];
  const windowStart = Math.max(0, first[0] - 40);
  const windowEnd = Math.min(source.length, windowStart + 140);
  const prefix = windowStart > 0 ? '…' : '';
  const suffix = windowEnd < source.length ? '…' : '';
  const text = prefix + source.slice(windowStart, windowEnd).replace(/\s+/g, ' ') + suffix;
  // Whitespace collapsing can shift offsets; recompute highlight ranges on the final text.
  const highlights: [number, number][] = [];
  const { text: f2, map: m2 } = foldWithMap(text);
  for (const { token, start } of tokensWithOffsets(f2)) {
    const term = terms.filter((t) => token.startsWith(t)).sort((a, b) => b.length - a.length)[0];
    if (!term) continue;
    const from = m2[start] ?? 0;
    highlights.push([from, (m2[start + term.length - 1] ?? from) + 1]);
  }
  return { text, highlights };
}
