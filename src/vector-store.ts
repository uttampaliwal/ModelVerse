import fs from 'fs';
import { vectorRecordArraySchema, loadAndValidate } from './config-schemas';
import { type EmbeddingProvider, tokenize, cosineSimilarity } from './embeddings';

export interface VectorRecord {
  id: string;
  text: string;
  vector: number[];
  dimension: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  provider?: string;
}

export interface SearchHit {
  record: VectorRecord;
  score: number;
}

export type SearchMode = 'semantic' | 'keyword' | 'hybrid';

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 150;
export const RRF_K = 60;
const HASH_PROVIDER_FALLBACK_NAME = 'hashed-bow';

export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP,
): string[] {
  const size = Math.max(1, Math.floor(chunkSize));
  const overlapSafe = Math.min(Math.max(0, Math.floor(overlap)), size - 1);
  if (text.length <= size) return text.length > 0 ? [text] : [];

  const chunks: string[] = [];
  const step = size - overlapSafe;
  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.substring(start, start + size));
    if (start + size >= text.length) break;
  }
  return chunks;
}

function keywordScore(queryTokens: string[], recordTokens: Set<string>): number {
  let score = 0;
  for (const token of new Set(queryTokens)) {
    if (recordTokens.has(token)) score++;
  }
  return score;
}

function reciprocalRankFusion(
  rankedLists: string[][],
  k: number = RRF_K,
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      scores.set(list[rank], (scores.get(list[rank]) || 0) + 1 / (k + rank + 1));
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

export class VectorStore {
  private records: VectorRecord[] = [];
  private storePath: string;
  private provider: EmbeddingProvider;

  constructor(storePath: string, provider: EmbeddingProvider) {
    this.storePath = storePath;
    this.provider = provider;
    this.load();
  }

  get dimension(): number {
    return this.provider.dimension;
  }

  get providerName(): string {
    return this.provider.name;
  }

  get size(): number {
    return this.records.length;
  }

  private load(): void {
    const records = loadAndValidate(
      vectorRecordArraySchema,
      this.storePath,
      [] as VectorRecord[],
      'VectorStore',
    );
    this.records = records.filter((r) => this.isCompatible(r));
  }

  private isCompatible(record: VectorRecord): boolean {
    return (
      record.dimension === this.provider.dimension &&
      (record.provider || HASH_PROVIDER_FALLBACK_NAME) === this.provider.name
    );
  }

  private save(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.records, null, 2));
    } catch {
      /* ignore */
    }
  }

  private removeFamily(id: string): void {
    const prefix = `${id}#`;
    this.records = this.records.filter((r) => r.id !== id && !r.id.startsWith(prefix));
  }

  async upsert(
    text: string,
    metadata: Record<string, unknown> = {},
    id?: string,
    chunkSize: number = DEFAULT_CHUNK_SIZE,
  ): Promise<string[]> {
    if (!text) return [];
    const baseId = id || `vec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const chunks = chunkText(text, chunkSize);
    if (chunks.length === 0) return [];

    this.removeFamily(baseId);
    const vectors = await this.provider.embed(chunks);

    const now = new Date().toISOString();
    const ids = chunks.map((chunk, index) => {
      const isSingle = chunks.length === 1;
      const recordId = isSingle ? baseId : `${baseId}#${index}`;
      const record: VectorRecord = {
        id: recordId,
        text: chunk,
        vector: vectors[index],
        dimension: this.provider.dimension,
        metadata:
          chunks.length > 1
            ? { ...metadata, chunk_index: index, total_chunks: chunks.length }
            : metadata,
        createdAt: now,
        provider: this.provider.name,
      };
      return record;
    });

    this.records.push(...ids);
    this.save();
    return ids.map((r) => r.id);
  }

  async search(query: string, topK: number = 5, mode: SearchMode = 'hybrid'): Promise<SearchHit[]> {
    if (!query || this.records.length === 0) return [];
    const compatible = this.records.filter((r) => this.isCompatible(r));
    if (compatible.length === 0) return [];

    if (mode === 'keyword') {
      return this.keywordHits(compatible, query).slice(0, topK);
    }

    const queryVector = (await this.provider.embed([query]))[0];
    const semanticHits = compatible
      .map((record) => ({
        record,
        score: cosineSimilarity(queryVector, record.vector, this.provider.dimension),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score);

    if (mode === 'semantic') return semanticHits.slice(0, topK);

    const keywordHits = this.keywordHits(compatible, query);
    const fused = reciprocalRankFusion([
      semanticHits.map((h) => h.record.id),
      keywordHits.map((h) => h.record.id),
    ]);
    const byId = new Map(semanticHits.concat(keywordHits).map((h) => [h.record.id, h]));
    return fused.map(({ id, score }) => ({ ...(byId.get(id) as SearchHit), score })).slice(0, topK);
  }

  private keywordHits(records: VectorRecord[], query: string): SearchHit[] {
    const queryTokens = tokenize(query);
    return records
      .map((record) => ({
        record,
        score: keywordScore(queryTokens, new Set(tokenize(record.text))),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  get(id: string): VectorRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  list(): VectorRecord[] {
    return [...this.records];
  }

  delete(id: string): boolean {
    const before = this.records.length;
    this.removeFamily(id);
    if (this.records.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  clear(): void {
    this.records = [];
    this.save();
  }

  stats(): { count: number; dimension: number; provider: string } {
    return {
      count: this.records.length,
      dimension: this.provider.dimension,
      provider: this.provider.name,
    };
  }
}
