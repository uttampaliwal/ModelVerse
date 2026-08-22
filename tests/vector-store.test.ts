import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { VectorStore, embed, cosineSimilarity, tokenize } from '../src/vector-store';

let tmpDir: string;
let storePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelverse-vector-'));
  storePath = path.join(tmpDir, 'vector-store.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric characters', () => {
    expect(tokenize('Hello, World! foo-bar')).toEqual(['hello', 'world', 'foo', 'bar']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('!!! ...')).toEqual([]);
  });
});

describe('embed', () => {
  it('produces L2-normalized vectors of requested dimension', () => {
    const vector = embed('the quick brown fox', 64);
    expect(vector).toHaveLength(64);
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('is deterministic for identical text', () => {
    expect(embed('deterministic embedding test')).toEqual(embed('deterministic embedding test'));
  });

  it('returns zero vector for empty text', () => {
    const vector = embed('', 32);
    expect(vector.every((v) => v === 0)).toBe(true);
  });

  it('gives similar texts higher similarity than dissimilar texts', () => {
    const a = embed('llama.cpp local inference server', 128);
    const b = embed('inference server running llama.cpp locally', 128);
    const c = embed('completely unrelated topic about gardening flowers', 128);
    const similar = cosineSimilarity(a, b, 128);
    const dissimilar = cosineSimilarity(a, c, 128);
    expect(similar).toBeGreaterThan(dissimilar);
    expect(similar).toBeGreaterThan(0.3);
  });
});

describe('VectorStore', () => {
  let store: VectorStore;

  beforeEach(() => {
    store = new VectorStore(storePath, 64);
  });

  it('upserts records and returns generated ids', () => {
    const id = store.upsert('first document text', { source: 'test' });
    expect(id).toMatch(/^vec_/);
    expect(store.size).toBe(1);
  });

  it('updates existing record when id is provided', () => {
    const id = store.upsert('original text');
    store.upsert('replaced text', {}, id);
    expect(store.size).toBe(1);
    expect(store.get(id)?.text).toBe('replaced text');
  });

  it('persists records to disk and reloads them', () => {
    const id = store.upsert('persistent record', { foo: 'bar' });
    const reloaded = new VectorStore(storePath, 64);
    expect(reloaded.size).toBe(1);
    expect(reloaded.get(id)?.metadata).toEqual({ foo: 'bar' });
  });

  it('ignores persisted records with mismatched dimension', () => {
    store.upsert('dimension sixty four');
    const mismatched = new VectorStore(storePath, 128);
    expect(mismatched.size).toBe(0);
  });

  it('ranks the most similar record first', () => {
    store.upsert('The Eiffel Tower is located in Paris, France');
    store.upsert('Guitars have six strings and are popular in rock music');
    const hits = store.search('where is the eiffel tower?', 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].record.text).toContain('Eiffel Tower');
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[1].score);
  });

  it('respects top_k limit', () => {
    for (let i = 0; i < 10; i++) {
      store.upsert(`document number ${i}`);
    }
    expect(store.search('document', 3)).toHaveLength(3);
  });

  it('excludes zero-score matches', () => {
    store.upsert('alpha beta gamma');
    expect(store.search('totally different vocabulary here', 5)).toHaveLength(0);
  });

  it('deletes records by id', () => {
    const id = store.upsert('to be deleted');
    expect(store.delete(id)).toBe(true);
    expect(store.size).toBe(0);
    expect(store.delete(id)).toBe(false);
  });

  it('clears all records', () => {
    store.upsert('one');
    store.upsert('two');
    store.clear();
    expect(store.size).toBe(0);
    const reloaded = new VectorStore(storePath, 64);
    expect(reloaded.size).toBe(0);
  });

  it('reports stats', () => {
    store.upsert('stats record one');
    store.upsert('stats record two');
    expect(store.stats()).toEqual({ count: 2, dimension: 64 });
  });

  it('lists all records', () => {
    store.upsert('list one');
    store.upsert('list two');
    expect(store.list()).toHaveLength(2);
  });
});
