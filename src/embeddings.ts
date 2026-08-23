import type { FeatureExtractionPipeline } from '@huggingface/transformers';

export interface EmbeddingProvider {
  readonly name: string;
  readonly dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

function normalize(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function embedHashedBow(text: string, dimension: number): number[] {
  const vector = new Array<number>(dimension).fill(0);
  const tokens = tokenize(text);
  if (tokens.length === 0) return vector;

  const counts = new Map<number, number>();
  for (const token of tokens) {
    const index = hashToken(token) % dimension;
    counts.set(index, (counts.get(index) || 0) + 1);
  }

  for (const [index, count] of counts) {
    vector[index] += 1 + Math.log(count);
  }
  return normalize(vector);
}

export class HashEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'hashed-bow';
  readonly dimension: number;

  constructor(dimension: number = 256) {
    this.dimension = Math.max(16, Math.floor(dimension));
  }

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((text) => embedHashedBow(text, this.dimension)));
  }
}

export const MINILM_MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'minilm-l6-v2';
  readonly dimension = 384;

  private modelId: string;
  private extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

  constructor(modelId: string = MINILM_MODEL_ID) {
    this.modelId = modelId;
  }

  private getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractorPromise) {
      this.extractorPromise = import('@huggingface/transformers').then((mod) =>
        mod.pipeline('feature-extraction', this.modelId, { dtype: 'q8' }),
      );
      this.extractorPromise.catch(() => {
        this.extractorPromise = null;
      });
    }
    return this.extractorPromise;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.getExtractor();
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    return output.tolist() as number[][];
  }
}

export type EmbeddingProviderId = 'minilm' | 'hash';

export function createEmbeddingProvider(
  id: string | undefined,
  hashDimension: number = 256,
): EmbeddingProvider {
  if (id === 'minilm') return new TransformersEmbeddingProvider();
  return new HashEmbeddingProvider(hashDimension);
}

export function cosineSimilarity(a: number[], b: number[], dimension: number): number {
  let dot = 0;
  const length = Math.min(a.length, b.length, dimension);
  for (let i = 0; i < length; i++) dot += a[i] * b[i];
  return dot;
}
