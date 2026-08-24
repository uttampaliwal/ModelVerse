import { describe, it, expect } from 'vitest';
import {
  normalizeId,
  mean,
  precisionAtK,
  recallAtK,
  hitRateAtK,
  mrrAtK,
  averagePrecisionAtK,
  faithfulness,
  tokenF1,
  answerRelevancy,
} from '../src/eval/metrics';
import { HashEmbeddingProvider } from '../src/embeddings';

describe('normalizeId', () => {
  it('strips chunk-family suffixes', () => {
    expect(normalizeId('doc1')).toBe('doc1');
    expect(normalizeId('doc1#0')).toBe('doc1');
    expect(normalizeId('doc1#12')).toBe('doc1');
  });
});

describe('mean', () => {
  it('averages finite values and returns 0 for empty input', () => {
    expect(mean([1, 2, 3])).toBeCloseTo(2, 9);
    expect(mean([])).toBe(0);
    expect(mean([NaN, 2])).toBe(2);
  });
});

describe('precisionAtK', () => {
  const retrieved = ['a#0', 'b', 'c', 'a#1'];
  const relevant = ['a', 'c'];

  it('counts relevant hits over k with family normalization', () => {
    expect(precisionAtK(retrieved, relevant, 4)).toBe(3 / 4);
    expect(precisionAtK(retrieved, relevant, 2)).toBe(1 / 2);
    expect(precisionAtK(retrieved, relevant, 1)).toBe(1);
  });

  it('handles empty inputs', () => {
    expect(precisionAtK([], relevant, 3)).toBe(0);
    expect(precisionAtK(['x'], [], 3)).toBe(0);
    expect(precisionAtK(['x'], relevant, 0)).toBe(0);
  });
});

describe('recallAtK', () => {
  it('measures fraction of gold ids found in top-k', () => {
    const retrieved = ['b', 'a#0', 'c'];
    expect(recallAtK(retrieved, ['a', 'c'], 3)).toBe(1);
    expect(recallAtK(retrieved, ['a', 'c'], 2)).toBe(0.5);
    expect(recallAtK(retrieved, ['a'], 1)).toBe(0);
  });

  it('returns 0 when no gold labels exist', () => {
    expect(recallAtK(['a'], [], 5)).toBe(0);
  });
});

describe('hitRateAtK', () => {
  it('returns binary presence of any gold id in top-k', () => {
    expect(hitRateAtK(['x', 'y', 'a'], ['a'], 3)).toBe(1);
    expect(hitRateAtK(['x', 'y', 'a'], ['a'], 2)).toBe(0);
    expect(hitRateAtK(['x'], [], 3)).toBe(0);
  });
});

describe('mrrAtK', () => {
  it('reciprocates the first relevant rank', () => {
    expect(mrrAtK(['a', 'b'], ['a'], 2)).toBe(1);
    expect(mrrAtK(['x', 'y', 'a'], ['a'], 3)).toBe(1 / 3);
    expect(mrrAtK(['x', 'y', 'z'], ['a'], 3)).toBe(0);
    expect(mrrAtK(['a#0', 'b'], ['a'], 2)).toBe(1);
  });
});

describe('averagePrecisionAtK', () => {
  it('rewards early hits and normalizes by min(gold, k)', () => {
    expect(averagePrecisionAtK(['a', 'b', 'c'], ['a'], 3)).toBeCloseTo(1, 9);
    expect(averagePrecisionAtK(['b', 'a'], ['a'], 2)).toBeCloseTo(1 / 2 / Math.min(1, 2), 9);
    expect(averagePrecisionAtK(['a', 'x', 'b'], ['a', 'b'], 3)).toBeCloseTo((1 + 2 / 3) / 2, 9);
    expect(averagePrecisionAtK(['x', 'y'], ['a'], 2)).toBe(0);
  });
});

describe('faithfulness', () => {
  it('scores answers fully supported by context as 1', () => {
    const score = faithfulness(['Paris is the capital of France.'], 'Paris is the capital.');
    expect(score).toBeCloseTo(1, 9);
  });

  it('penalizes claims absent from context', () => {
    const contexts = ['The sky is blue during the day.'];
    const supported = faithfulness(contexts, 'The sky is blue.');
    const unsupported = faithfulness(contexts, 'Elephants paint watercolors.');
    expect(supported).toBeGreaterThan(unsupported);
    expect(unsupported).toBeLessThan(0.2);
  });

  it('averages support across sentences', () => {
    const contexts = ['Cats sleep a lot.'];
    const answer = 'Cats sleep. Dogs fly.';
    const catsOnly = tokenizeSupportRatio(contexts, 'Cats sleep.');
    const dogsOnly = tokenizeSupportRatio(contexts, 'Dogs fly.');
    expect(faithfulness(contexts, answer)).toBeCloseTo((catsOnly + dogsOnly) / 2, 6);
  });

  it('returns 0 for empty answers or contexts', () => {
    expect(faithfulness([], 'anything')).toBe(0);
    expect(faithfulness(['ctx'], '')).toBe(0);
    expect(faithfulness(['ctx'], '   ')).toBe(0);
  });

  function tokenizeSupportRatio(contexts: string[], sentence: string): number {
    return faithfulness(contexts, sentence);
  }
});

describe('tokenF1', () => {
  it('is 1 for identical text and 0 for disjoint text', () => {
    expect(tokenF1('red sports car', 'red sports car')).toBe(1);
    expect(tokenF1('red car', 'blue boat')).toBe(0);
  });

  it('balances precision and recall for partial overlap', () => {
    expect(tokenF1('fast red car', 'red car')).toBeCloseTo(
      (2 * (2 / 3) * (2 / 2)) / (2 / 3 + 1),
      6,
    );
    expect(tokenF1('', 'word')).toBe(0);
  });
});

describe('answerRelevancy', () => {
  it('falls back to token F1 without an embedder', async () => {
    await expect(answerRelevancy('red car', 'car red')).resolves.toBeCloseTo(1, 6);
    await expect(answerRelevancy('red car', 'ocean waves')).resolves.toBe(0);
    await expect(answerRelevancy('', 'answer')).resolves.toBe(0);
  });

  it('uses embedding cosine when an embedder is provided', async () => {
    const provider = new HashEmbeddingProvider(64);
    const same = await answerRelevancy('database transactions', 'transactions database', (t) =>
      provider.embed(t),
    );
    const unrelated = await answerRelevancy('database transactions', 'gardening flowers', (t) =>
      provider.embed(t),
    );
    expect(same).toBeGreaterThan(unrelated);
    expect(same).toBeGreaterThan(0);
    expect(unrelated).toBeGreaterThanOrEqual(0);
  });
});
