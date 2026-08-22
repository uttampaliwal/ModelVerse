import fs from 'fs';
import { vectorRecordArraySchema, loadAndValidate } from './config-schemas';

export interface VectorRecord {
  id: string;
  text: string;
  vector: number[];
  dimension: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SearchHit {
  record: VectorRecord;
  score: number;
}

const DEFAULT_DIMENSION = 256;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function embed(text: string, dimension: number = DEFAULT_DIMENSION): number[] {
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

function normalize(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

export function cosineSimilarity(a: number[], b: number[], dimension: number): number {
  let dot = 0;
  const length = Math.min(a.length, b.length, dimension);
  for (let i = 0; i < length; i++) dot += a[i] * b[i];
  return dot;
}

export class VectorStore {
  private records: VectorRecord[] = [];
  private storePath: string;
  private dimension: number;

  constructor(storePath: string, dimension: number = DEFAULT_DIMENSION) {
    this.storePath = storePath;
    this.dimension = dimension;
    this.load();
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
    this.records = records.filter((r) => r.dimension === this.dimension);
  }

  private save(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.records, null, 2));
    } catch {
      /* ignore */
    }
  }

  upsert(text: string, metadata: Record<string, unknown> = {}, id?: string): string {
    const recordId = id || `vec_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const existingIndex = this.records.findIndex((r) => r.id === recordId);
    const record: VectorRecord = {
      id: recordId,
      text,
      vector: embed(text, this.dimension),
      dimension: this.dimension,
      metadata,
      createdAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      this.records[existingIndex] = record;
    } else {
      this.records.push(record);
    }
    this.save();
    return recordId;
  }

  search(query: string, topK: number = 5): SearchHit[] {
    const queryVector = embed(query, this.dimension);
    return this.records
      .map((record) => ({
        record,
        score: cosineSimilarity(queryVector, record.vector, this.dimension),
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  get(id: string): VectorRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  list(): VectorRecord[] {
    return [...this.records];
  }

  delete(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
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

  stats(): { count: number; dimension: number } {
    return { count: this.records.length, dimension: this.dimension };
  }
}
