import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EmbeddingProvider,
  HashEmbeddingProvider,
  TransformersEmbeddingProvider,
  MINILM_MODEL_ID,
  createEmbeddingProvider,
  embedHashedBow,
  cosineSimilarity,
  tokenize,
} from '../src/embeddings';

const { mockExtractor } = vi.hoisted(() => {
  const fakeVector = (text: string): number[] => {
    const vector = [
      text.length % 5 || 1,
      (text.charCodeAt(0) || 0) % 7 || 1,
      text.includes('x') ? 2 : 0,
      1,
    ];
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    return vector.map((v) => v / norm);
  };
  return {
    mockExtractor: async (texts: string | string[]) => {
      const list = Array.isArray(texts) ? texts : [texts];
      return { tolist: () => list.map(fakeVector) };
    },
  };
});

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async () => mockExtractor),
}));

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric characters', () => {
    expect(tokenize('Hello, World! foo-bar')).toEqual(['hello', 'world', 'foo', 'bar']);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('!!! ...')).toEqual([]);
  });
});

describe('embedHashedBow', () => {
  it('produces L2-normalized vectors of requested dimension', () => {
    const vector = embedHashedBow('the quick brown fox', 64);
    expect(vector).toHaveLength(64);
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('is deterministic for identical text', () => {
    expect(embedHashedBow('deterministic embedding test')).toEqual(
      embedHashedBow('deterministic embedding test'),
    );
  });

  it('returns zero vector for empty text', () => {
    expect(embedHashedBow('', 32).every((v) => v === 0)).toBe(true);
  });

  it('gives lexically similar texts higher similarity than dissimilar texts', () => {
    const a = embedHashedBow('llama.cpp local inference server', 128);
    const b = embedHashedBow('inference server running llama.cpp locally', 128);
    const c = embedHashedBow('completely unrelated topic about gardening flowers', 128);
    expect(cosineSimilarity(a, b, 128)).toBeGreaterThan(cosineSimilarity(a, c, 128));
  });
});

describe('cosineSimilarity', () => {
  it('computes dot product over the given dimension', () => {
    expect(cosineSimilarity([1, 0], [0, 1], 2)).toBe(0);
    expect(cosineSimilarity([1, 0], [1, 0], 2)).toBe(1);
    expect(cosineSimilarity([0.5, 0.5], [1, 0], 1)).toBeCloseTo(0.5, 5);
  });
});

describe('HashEmbeddingProvider', () => {
  it('embeds batches with configured dimension', async () => {
    const provider = new HashEmbeddingProvider(64);
    const vectors = await provider.embed(['one two', 'three']);
    expect(vectors).toHaveLength(2);
    for (const vector of vectors) expect(vector).toHaveLength(64);
  });

  it('clamps tiny dimensions', () => {
    expect(new HashEmbeddingProvider(1).dimension).toBe(16);
  });

  it('exposes fallback provider name', () => {
    expect(new HashEmbeddingProvider().name).toBe('hashed-bow');
  });
});

describe('TransformersEmbeddingProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports MiniLM model identity and 384 dimensions', () => {
    const provider = new TransformersEmbeddingProvider();
    expect(provider.name).toBe('minilm-l6-v2');
    expect(provider.dimension).toBe(384);
    expect(MINILM_MODEL_ID).toContain('all-MiniLM-L6-v2');
  });

  it('creates exactly one ONNX extractor lazily on first use', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const provider = new TransformersEmbeddingProvider();
    expect(pipeline).not.toHaveBeenCalled();

    const vectors = await provider.embed(['short', 'a much longer sentence with x']);
    expect(pipeline).toHaveBeenCalledTimes(1);

    expect(vectors).toHaveLength(2);
    expect(vectors[0]).toHaveLength(4);
    for (const vector of vectors) {
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 5);
    }

    await provider.embed(['second call']);
    expect(pipeline).toHaveBeenCalledTimes(1);
  });

  it('returns empty batch without invoking the pipeline', async () => {
    const { pipeline } = await import('@huggingface/transformers');
    const provider = new TransformersEmbeddingProvider();
    expect(await provider.embed([])).toEqual([]);
    expect(pipeline).not.toHaveBeenCalled();
  });
});

describe('createEmbeddingProvider', () => {
  it('creates the MiniLM provider on request', () => {
    expect(createEmbeddingProvider('minilm')).toBeInstanceOf(TransformersEmbeddingProvider);
  });

  it('defaults to the hash fallback', () => {
    const provider = createEmbeddingProvider(undefined, 128);
    expect(provider).toBeInstanceOf(HashEmbeddingProvider);
    expect(provider.dimension).toBe(128);
    expect(createEmbeddingProvider('unknown-thing').dimension).toBe(256);
  });

  it('satisfies the common provider interface', () => {
    const providers: EmbeddingProvider[] = [
      createEmbeddingProvider('minilm'),
      createEmbeddingProvider('hash', 32),
    ];
    for (const provider of providers) {
      expect(typeof provider.name).toBe('string');
      expect(provider.dimension).toBeGreaterThan(0);
      expect(typeof provider.embed).toBe('function');
    }
  });
});
