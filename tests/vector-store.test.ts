import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { VectorStore, chunkText, DEFAULT_CHUNK_SIZE, RRF_K } from '../src/vector-store';
import {
  HashEmbeddingProvider,
  TransformersEmbeddingProvider,
  createEmbeddingProvider,
} from '../src/embeddings';

const { mockExtractor } = vi.hoisted(() => {
  const fakeVector = (text: string): number[] => {
    const vector = [text.length % 3 || 1, text.includes('car') ? 3 : 0, 0, 1];
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / norm);
  };
  return {
    mockExtractor: async (texts: string | string[]) => ({
      tolist: () => (Array.isArray(texts) ? texts : [texts]).map(fakeVector),
    }),
  };
});

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async () => mockExtractor),
}));

let tmpDir: string;
let storePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelverse-vector-'));
  storePath = path.join(tmpDir, 'vector-store.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeStore(dimension = 64, filePath = storePath): VectorStore {
  return new VectorStore(filePath, new HashEmbeddingProvider(dimension));
}

describe('chunkText', () => {
  it('returns short text as a single chunk', () => {
    expect(chunkText('short text')).toEqual(['short text']);
    expect(chunkText('', 100)).toEqual([]);
  });

  it('splits long text into overlapping chunks', () => {
    expect(chunkText('abcdefghij', 4, 1)).toEqual(['abcd', 'defg', 'ghij']);
  });

  it('covers the whole text with correct overlap windows', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz0123456789';
    const size = 10;
    const overlap = 3;
    const chunks = chunkText(text, size, overlap);
    const step = size - overlap;
    const expectedStarts = [0];
    while (expectedStarts[expectedStarts.length - 1] + size < text.length) {
      expectedStarts.push(expectedStarts[expectedStarts.length - 1] + step);
    }
    expect(chunks.map((_, i) => i)).toHaveLength(expectedStarts.length);
    chunks.forEach((chunk, i) => {
      expect(chunk).toBe(text.slice(expectedStarts[i], expectedStarts[i] + size));
    });
    const lastStart = expectedStarts[expectedStarts.length - 1];
    expect(lastStart + chunks[chunks.length - 1].length).toBe(text.length);
  });

  it('clamps overlap below chunk size so progress is always made', () => {
    const chunks = chunkText('abcdefghij', 4, 100);
    expect(chunks.every((c) => c.length <= 4 && c.length > 0)).toBe(true);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1]).toBe('ghij');
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_CHUNK_SIZE).toBeGreaterThan(100);
    expect(RRF_K).toBeGreaterThan(0);
  });
});

describe('VectorStore upsert and persistence', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = makeStore();
  });

  it('upserts records and returns generated ids', async () => {
    const ids = await store.upsert('first document text', { source: 'test' });
    expect(ids).toHaveLength(1);
    expect(ids[0]).toMatch(/^vec_/);
    expect(store.size).toBe(1);
  });

  it('persists records to disk with provider metadata and reloads them', async () => {
    const [id] = await store.upsert('persistent record', { foo: 'bar' });
    const reloaded = makeStore();
    expect(reloaded.size).toBe(1);
    const record = reloaded.get(id)!;
    expect(record.metadata).toEqual({ foo: 'bar' });
    expect(record.provider).toBe('hashed-bow');
  });

  it('chunks long texts into multiple records at ingestion', async () => {
    const text = 'word '.repeat(50);
    const ids = await store.upsert(text, { src: 'doc' }, 'doc1', 200);
    expect(ids.length).toBeGreaterThan(1);
    expect(ids.every((id) => id.startsWith('doc1#'))).toBe(true);
    const first = store.get(ids[0])!;
    expect(first.metadata.chunk_index).toBe(0);
    expect(first.metadata.total_chunks).toBe(ids.length);
    for (const id of ids) expect(store.get(id)!.text.length).toBeLessThanOrEqual(200);
    expect(store.size).toBe(ids.length);
  });

  it('keeps plain id for single-chunk upserts and updates in place', async () => {
    const [id] = await store.upsert('original text', {}, 'doc2');
    expect(id).toBe('doc2');
    await store.upsert('replaced text', {}, 'doc2');
    expect(store.size).toBe(1);
    expect(store.get('doc2')?.text).toBe('replaced text');
  });

  it('replaces the whole chunk family when re-upserting the same id', async () => {
    await store.upsert('a'.repeat(1000), {}, 'doc3', 200);
    expect(store.size).toBeGreaterThan(1);
    await store.upsert('tiny replacement', {}, 'doc3', 200);
    expect(store.size).toBe(1);
    expect(store.get('doc3')?.text).toBe('tiny replacement');
    expect(store.list().some((r) => r.id.startsWith('doc3#'))).toBe(false);
  });

  it('deletes record families by base id', async () => {
    await store.upsert('b'.repeat(800), {}, 'doc4', 300);
    expect(store.delete('doc4')).toBe(true);
    expect(store.size).toBe(0);
    expect(store.delete('doc4')).toBe(false);
  });

  it('ignores persisted records from incompatible providers or dimensions', async () => {
    await store.upsert('dimension sixty four record');
    expect(makeStore(128).size).toBe(0);

    const otherFile = path.join(tmpDir, 'other.json');
    fs.writeFileSync(
      otherFile,
      JSON.stringify([
        {
          id: 'legacy',
          text: 'legacy hashed record without provider field',
          vector: new Array(64).fill(0.5),
          dimension: 64,
          metadata: {},
          createdAt: new Date().toISOString(),
        },
        {
          id: 'foreign',
          text: 'minilm record',
          vector: new Array(384).fill(0.1),
          dimension: 384,
          metadata: {},
          createdAt: new Date().toISOString(),
          provider: 'minilm-l6-v2',
        },
      ]),
    );
    expect(
      new VectorStore(otherFile, new HashEmbeddingProvider(64)).list().map((r) => r.id),
    ).toEqual(['legacy']);
  });

  it('clears all records and persists the empty state', async () => {
    await store.upsert('one');
    await store.upsert('two');
    store.clear();
    expect(store.size).toBe(0);
    expect(makeStore().size).toBe(0);
  });

  it('reports stats including provider identity', async () => {
    await store.upsert('stats record one');
    await store.upsert('stats record two');
    expect(store.stats()).toEqual({ count: 2, dimension: 64, provider: 'hashed-bow' });
  });
});

describe('VectorStore retrieval modes', () => {
  let store: VectorStore;
  const QUERY = 'database transactions';

  beforeEach(async () => {
    store = makeStore();
    await store.upsert('database transactions', {}, 'dominant');
    await store.upsert('database locking keeps records consistent', {}, 'strong');
    await store.upsert('sunny beach vacation packing list', {}, 'noise');
  });

  it('semantic mode drops zero-similarity noise', async () => {
    const hits = await store.search(QUERY, 5, 'semantic');
    const ids = hits.map((h) => h.record.id);
    expect(ids).not.toContain('noise');
    expect(ids).toContain('dominant');
  });

  it('keyword mode matches exact terms only', async () => {
    const hits = await store.search(QUERY, 5, 'keyword');
    expect(hits.map((h) => h.record.id)).toEqual(['dominant', 'strong']);
    for (const hit of hits) expect(hit.score).toBeGreaterThanOrEqual(1);
  });

  it('hybrid mode fuses both rankings via reciprocal rank fusion', async () => {
    const hits = await store.search(QUERY, 5, 'hybrid');
    const ids = hits.map((h) => h.record.id);
    expect(ids).not.toContain('noise');
    expect(ids).toContain('strong');

    const dominantScore = hits.find((h) => h.record.id === 'dominant')!.score;
    expect(dominantScore).toBeCloseTo(2 / (RRF_K + 1), 5);

    const semanticScores = (await store.search(QUERY, 5, 'semantic')).map((h) => h.score);
    expect(dominantScore).not.toBeCloseTo(semanticScores[0], 3);
  });

  it('respects top_k and returns scores in descending order', async () => {
    expect(await store.search(QUERY, 1, 'hybrid')).toHaveLength(1);
    const many = await store.search(QUERY, 5, 'hybrid');
    for (let i = 1; i < many.length; i++) {
      expect(many[i - 1].score).toBeGreaterThanOrEqual(many[i].score);
    }
  });

  it('returns empty results for empty queries or stores', async () => {
    expect(await store.search('', 5)).toEqual([]);
    const empty = new VectorStore(path.join(tmpDir, 'empty.json'), new HashEmbeddingProvider(64));
    expect(await empty.search(QUERY, 5)).toEqual([]);
  });
});

describe('VectorStore embedding failures surface as errors', () => {
  it('propagates provider errors from upsert and search', async () => {
    const file = path.join(tmpDir, 'fail.json');
    const seeded = new VectorStore(file, new HashEmbeddingProvider(16));
    await seeded.upsert('seeded text');

    const failing: HashEmbeddingProvider = Object.assign(new HashEmbeddingProvider(16), {
      embed: async () => {
        throw new Error('model unavailable');
      },
    }) as unknown as HashEmbeddingProvider;
    const failingStore = new VectorStore(file, failing);
    await expect(failingStore.upsert('text')).rejects.toThrow('model unavailable');
    await expect(failingStore.search('query', 5, 'semantic')).rejects.toThrow('model unavailable');
  });
});

describe('VectorStore with MiniLM-style provider', () => {
  it('stores and retrieves 384-dimensional records isolated from hash stores', async () => {
    const provider = createEmbeddingProvider('minilm');
    const file = path.join(tmpDir, 'minilm.json');
    const minilmStore = new VectorStore(file, provider);

    const [id] = await minilmStore.upsert('my car is fast', { topic: 'vehicles' });
    expect(minilmStore.dimension).toBe(384);
    expect(minilmStore.get(id)?.provider).toBe('minilm-l6-v2');

    const hashStore = new VectorStore(file, new HashEmbeddingProvider(256));
    expect(hashStore.size).toBe(0);
    expect(hashStore.get(id)).toBeUndefined();

    const hits = await minilmStore.search('fast car', 3, 'semantic');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].record.id).toBe(id);
  });

  it('is selected over the hash fallback by the factory', () => {
    expect(createEmbeddingProvider('minilm')).toBeInstanceOf(TransformersEmbeddingProvider);
    expect(createEmbeddingProvider('hash', 32)).toBeInstanceOf(HashEmbeddingProvider);
  });
});
