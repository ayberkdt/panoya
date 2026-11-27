import { fold, tokenize } from './fold';

/**
 * Query language (spec 09): free text plus filters
 *   tag:foo   type:link   in:university   before:2026-01-31   after:2026-01-01
 * Quoted values are allowed: in:"Ders notları". Unknown filters produce a helpful error instead
 * of silently matching everything.
 */
export interface ParsedQuery {
  terms: string[];
  /** Folded free text (for exact-title comparison). */
  text: string;
  tags: string[];
  types: string[];
  inPath: string[];
  before: string | null;
  after: string | null;
  errors: QueryError[];
}

export type QueryError =
  | { code: 'unknownFilter'; filter: string }
  | { code: 'badDate'; filter: 'before' | 'after'; value: string }
  | { code: 'emptyFilter'; filter: string };

export const FILTERS = ['tag', 'type', 'in', 'before', 'after'] as const;

const PART = /(\w+):("([^"]*)"|\S*)|"([^"]*)"|(\S+)/gu;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseQuery(input: string): ParsedQuery {
  const q: ParsedQuery = {
    terms: [],
    text: '',
    tags: [],
    types: [],
    inPath: [],
    before: null,
    after: null,
    errors: [],
  };
  const free: string[] = [];
  for (const m of input.matchAll(PART)) {
    const [, key, , quotedValue, quotedFree, bare] = m;
    if (key !== undefined) {
      const rawValue = quotedValue ?? m[2] ?? '';
      const name = key.toLowerCase();
      if (!(FILTERS as readonly string[]).includes(name)) {
        // "http://..." or "saat:10" in free text is not a filter attempt when the key is unknown
        // and the value is non-empty; treat such words as text but still report the filter.
        q.errors.push({ code: 'unknownFilter', filter: name });
        free.push(m[0]);
        continue;
      }
      if (rawValue === '') {
        q.errors.push({ code: 'emptyFilter', filter: name });
        continue;
      }
      if (name === 'tag') q.tags.push(fold(rawValue));
      else if (name === 'type') q.types.push(rawValue);
      else if (name === 'in') q.inPath.push(fold(rawValue));
      else if (name === 'before' || name === 'after') {
        if (!DATE.test(rawValue) || Number.isNaN(Date.parse(rawValue))) {
          q.errors.push({ code: 'badDate', filter: name, value: rawValue });
        } else q[name] = rawValue;
      }
    } else {
      free.push(quotedFree ?? bare ?? '');
    }
  }
  q.text = fold(free.join(' ').trim());
  q.terms = tokenize(free.join(' '));
  return q;
}

export function hasCriteria(q: ParsedQuery): boolean {
  return (
    q.terms.length > 0 ||
    q.tags.length > 0 ||
    q.types.length > 0 ||
    q.inPath.length > 0 ||
    q.before !== null ||
    q.after !== null
  );
}
