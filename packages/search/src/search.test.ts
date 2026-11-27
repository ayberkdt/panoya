import { describe, expect, it } from 'vitest';
import { exactKey, fold, foldWithMap, tokenize } from './fold';
import { parseQuery } from './query';
import { SearchIndex, type SearchDoc } from './searchIndex';

const doc = (id: string, over: Partial<SearchDoc> = {}): SearchDoc => ({
  id,
  kind: 'page',
  pageId: id,
  type: 'page',
  title: '',
  fields: {},
  tags: [],
  path: [],
  updatedAt: '2026-01-02T10:00:00.000Z',
  revision: 1,
  ...over,
});

describe('Turkish folding', () => {
  it('handles I/İ/ı/i and accents', () => {
    expect(fold('İSTANBUL')).toBe('istanbul');
    expect(fold('ISPARTA')).toBe('isparta'); // I → ı → i (secondary key)
    expect(fold('Işık')).toBe('isik');
    expect(fold('Öğrenci Ünite Çağ Şeker')).toBe('ogrenci unite cag seker');
    expect(exactKey('IŞIK')).toBe('ışık'); // exact key keeps dotless ı
  });

  it('maps folded offsets back to the original text', () => {
    const { text, map } = foldWithMap('Aİx');
    expect(text).toBe('aix');
    expect(map).toEqual([0, 1, 2]);
  });

  it('normalizes decomposed input (NFD) to the same tokens', () => {
    expect(tokenize('Öğrenci')).toEqual(tokenize('Öğrenci'));
  });
});

describe('query parser', () => {
  it('parses filters, quoted values and free text', () => {
    const q = parseQuery(
      'yoklama tag:ders in:"Ders notları" type:link after:2026-01-01 before:2026-02-01',
    );
    expect(q.terms).toEqual(['yoklama']);
    expect(q.tags).toEqual(['ders']);
    expect(q.inPath).toEqual(['ders notlari']);
    expect(q.types).toEqual(['link']);
    expect([q.after, q.before]).toEqual(['2026-01-01', '2026-02-01']);
    expect(q.errors).toEqual([]);
  });

  it('reports helpful errors', () => {
    const q = parseQuery('before:yarın foo:bar tag:');
    expect(q.errors).toEqual([
      { code: 'badDate', filter: 'before', value: 'yarın' },
      { code: 'unknownFilter', filter: 'foo' },
      { code: 'emptyFilter', filter: 'tag' },
    ]);
  });
});

describe('SearchIndex', () => {
  it('ranks exact title > title prefix > tag > content, recency breaks ties', () => {
    const idx = new SearchIndex();
    idx.upsert(doc('content', { fields: { content: 'yoklama formu burada' } }));
    idx.upsert(doc('tag', { title: 'Başka', tags: ['yoklama'] }));
    idx.upsert(doc('prefix', { title: 'Yoklama listesi' }));
    idx.upsert(doc('exact', { title: 'Yoklama' }));
    expect(idx.search('yoklama').hits.map((h) => h.doc.id)).toEqual([
      'exact',
      'prefix',
      'tag',
      'content',
    ]);

    const idx2 = new SearchIndex();
    idx2.upsert(doc('old', { title: 'Not', updatedAt: '2025-01-01T00:00:00.000Z' }));
    idx2.upsert(doc('new', { title: 'Not', updatedAt: '2026-06-01T00:00:00.000Z' }));
    expect(idx2.search('not').hits.map((h) => h.doc.id)).toEqual(['new', 'old']);
  });

  it('matches prefixes and requires every term (AND)', () => {
    const idx = new SearchIndex();
    idx.upsert(doc('a', { title: 'Satellite Systems', fields: { content: 'yörünge mekaniği' } }));
    idx.upsert(doc('b', { title: 'Satellite Phones' }));
    expect(idx.search('sat yor').hits.map((h) => h.doc.id)).toEqual(['a']);
    expect(idx.search('sat').hits).toHaveLength(2);
  });

  it('finds Turkish text regardless of case and accents (I/İ/ı/i)', () => {
    const idx = new SearchIndex();
    idx.upsert(doc('ist', { title: 'İstanbul gezisi' }));
    idx.upsert(doc('isik', { title: 'IŞIK deneyi' }));
    expect(idx.search('istanbul').hits[0]?.doc.id).toBe('ist');
    expect(idx.search('ISTANBUL').hits[0]?.doc.id).toBe('ist');
    expect(idx.search('ışık').hits[0]?.doc.id).toBe('isik');
    expect(idx.search('isik').hits[0]?.doc.id).toBe('isik');
  });

  it('updates and removes docs incrementally, skipping unchanged revisions', () => {
    const idx = new SearchIndex();
    idx.upsert(doc('p', { title: 'Eski başlık' }));
    expect(idx.search('eski').hits).toHaveLength(1);
    idx.upsert(doc('p', { title: 'Yeni başlık', revision: 2 }));
    expect(idx.search('eski').hits).toHaveLength(0);
    expect(idx.search('yeni').hits).toHaveLength(1);
    idx.upsert(doc('p', { title: 'Ignored', revision: 2 })); // same revision → no-op
    expect(idx.search('ignored').hits).toHaveLength(0);
    idx.remove('p');
    expect(idx.search('yeni').hits).toHaveLength(0);
    expect(idx.size).toBe(0);
  });

  it('distinguishes duplicate titles by path and filters by in:/type:/tag:/date', () => {
    const idx = new SearchIndex();
    idx.upsert(
      doc('u', {
        title: 'Notlar',
        path: ['Üniversite', 'Ders notları'],
        updatedAt: '2026-01-10T00:00:00.000Z',
      }),
    );
    idx.upsert(
      doc('k', { title: 'Notlar', path: ['Kişisel'], updatedAt: '2026-03-10T00:00:00.000Z' }),
    );
    idx.upsert(
      doc('l', {
        kind: 'block',
        type: 'link',
        title: 'Yoklama',
        tags: ['Satellite Systems'],
        path: ['Üniversite'],
      }),
    );
    expect(idx.search('notlar in:univ').hits.map((h) => h.doc.id)).toEqual(['u']);
    expect(idx.search('type:link').hits.map((h) => h.doc.id)).toEqual(['l']);
    expect(idx.search('tag:satellite').hits.map((h) => h.doc.id)).toEqual(['l']);
    expect(idx.search('notlar after:2026-02-01').hits.map((h) => h.doc.id)).toEqual(['k']);
    expect(idx.search('notlar before:2026-02-01').hits.map((h) => h.doc.id)).toEqual(['u']);
  });

  it('returns a snippet with highlight ranges in original-text coordinates', () => {
    const idx = new SearchIndex();
    const content = 'Bu dönemki ÖDEV teslim tarihi cuma günüdür.';
    idx.upsert(doc('c', { fields: { content } }));
    const hit = idx.search('odev').hits[0]!;
    expect(hit.field).toBe('content');
    const [from, to] = hit.snippet!.highlights[0]!;
    expect(hit.snippet!.text.slice(from, to)).toBe('ÖDEV');
  });

  it('benchmark: 1k pages / 10k block docs (Node, informational)', () => {
    const idx = new SearchIndex();
    const words = [
      'yörünge',
      'itki',
      'ödev',
      'sınav',
      'link',
      'mail',
      'proje',
      'bütçe',
      'deney',
      'rapor',
    ];
    const t0 = performance.now();
    for (let p = 0; p < 1000; p++) {
      idx.upsert(doc(`p${p}`, { title: `Sayfa ${p} ${words[p % 10]}` }));
      for (let b = 0; b < 10; b++) {
        idx.upsert(
          doc(`p${p}b${b}`, {
            kind: 'block',
            type: 'richText',
            pageId: `p${p}`,
            fields: { content: `${words[(p + b) % 10]} not ${p}-${b} içerik metni` },
          }),
        );
      }
    }
    const build = performance.now() - t0;
    const times: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t = performance.now();
      idx.search(words[i % 10]!.slice(0, 3));
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.floor(times.length * 0.95)]!;
    console.info(
      `[bench] build ${build.toFixed(0)} ms for ${idx.size} docs; query p95 ${p95.toFixed(1)} ms`,
    );
    expect(idx.size).toBe(11000);
    expect(p95).toBeLessThan(300); // spec target (browser); Node number is informational
  });
});
