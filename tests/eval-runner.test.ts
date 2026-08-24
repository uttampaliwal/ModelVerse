import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { VectorStore } from '../src/vector-store';
import { HashEmbeddingProvider } from '../src/embeddings';
import type { EvalDataset } from '../src/config-schemas';
import {
  loadEvalDataset,
  saveJsonReport,
  vectorStoreRetriever,
  ingestCorpus,
  runEvaluation,
} from '../src/eval';

let tmpDir: string;
let storePath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'modelverse-eval-'));
  storePath = path.join(tmpDir, 'store.json');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const DATASET: EvalDataset = {
  name: 'unit-dataset',
  description: 'inline fixture',
  top_k: 3,
  corpus: [
    { id: 'doc-paris', text: 'Paris is the capital city of France in western Europe.' },
    { id: 'doc-cars', text: 'Electric cars use batteries instead of gasoline engines.' },
    { id: 'doc-chunky', text: `database ${'indexing internals '.repeat(80)}for queries` },
    { id: 'doc-noise', text: 'The chef bakes sourdough bread every morning.' },
  ],
  cases: [
    {
      id: 'q-capital',
      query: 'capital of France',
      relevant_ids: ['doc-paris'],
      answer: 'Paris is the capital of France.',
    },
    {
      id: 'q-electric',
      query: 'electric car batteries',
      relevant_ids: ['doc-cars', 'doc-paris'],
      answer: 'Electric cars run on battery power.',
    },
    {
      id: 'q-bread',
      query: 'sourdough bread schedule',
      relevant_ids: ['doc-noise'],
    },
  ],
};

describe('loadEvalDataset', () => {
  it('loads a valid dataset file', () => {
    const file = path.join(tmpDir, 'ds.json');
    fs.writeFileSync(file, JSON.stringify(DATASET));
    const dataset = loadEvalDataset(file);
    expect(dataset.name).toBe('unit-dataset');
    expect(dataset.top_k).toBe(3);
    expect(dataset.cases).toHaveLength(3);
  });

  it('applies schema defaults for optional fields', () => {
    const file = path.join(tmpDir, 'ds.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ name: 'x', corpus: [], cases: [{ id: 'c1', query: 'q' }] }),
    );
    const dataset = loadEvalDataset(file);
    expect(dataset.description).toBe('');
    expect(dataset.top_k).toBe(5);
    expect(dataset.cases[0].relevant_ids).toEqual([]);
  });

  it('returns an empty placeholder for missing files', () => {
    const dataset = loadEvalDataset(path.join(tmpDir, 'missing.json'));
    expect(dataset.cases).toHaveLength(0);
  });
});

describe('saveJsonReport', () => {
  it('writes pretty json to disk', () => {
    const file = path.join(tmpDir, 'report.json');
    saveJsonReport(file, { ok: true });
    expect(JSON.parse(fs.readFileSync(file, 'utf-8'))).toEqual({ ok: true });
  });
});

describe('vectorStoreRetriever + ingestCorpus + runEvaluation', () => {
  let store: VectorStore;

  beforeEach(async () => {
    store = new VectorStore(storePath, new HashEmbeddingProvider(64));
    await ingestCorpus(store, DATASET.corpus);
  });

  it('ingests corpus with family-aware ids', () => {
    expect(store.list().some((r) => r.id === 'doc-paris')).toBe(true);
    expect(store.list().some((r) => r.id.startsWith('doc-chunky#'))).toBe(true);
    const chunky = store.list().find((r) => r.id.startsWith('doc-chunky#'))!;
    expect(chunky.metadata.eval_doc_id).toBe('doc-chunky');
  });

  it('produces a full report with per-case and aggregate metrics', async () => {
    const report = await runEvaluation(DATASET, vectorStoreRetriever(store, 'hybrid'));

    expect(report.dataset).toBe('unit-dataset');
    expect(report.case_count).toBe(3);
    expect(report.cases).toHaveLength(3);

    for (const c of report.cases) {
      expect(c.retrieved_ids.length).toBeGreaterThan(0);
      expect(c.recall_at_k).not.toBeNull();
    }

    expect(report.aggregate.recall_at_k).toBeGreaterThanOrEqual(0);
    expect(report.aggregate.recall_at_k).toBeLessThanOrEqual(1);
    expect(report.aggregate.mrr_at_k).toBeGreaterThan(0);
    expect(report.aggregate.faithfulness).toBeGreaterThan(0);
    expect(report.aggregate.answer_relevancy).toBeGreaterThan(0);
  }, 30000);

  it('ranks exact-answer documents first for lexical queries', async () => {
    const report = await runEvaluation(DATASET, vectorStoreRetriever(store, 'hybrid'));
    const capitalCase = report.cases.find((c) => c.id === 'q-capital')!;
    expect(capitalCase.retrieved_ids[0]).toBe('doc-paris');
    expect(capitalCase.mrr_at_k).toBe(1);
  });

  it('collapses chunk families into unique parent ids in reports', async () => {
    const provider = new HashEmbeddingProvider(64);
    const report = await runEvaluation(
      {
        ...DATASET,
        cases: [{ id: 'q-db', query: 'database indexing internals', relevant_ids: ['doc-chunky'] }],
      },
      vectorStoreRetriever(store, 'semantic'),
      { embed: (texts) => provider.embed(texts) },
    );
    const ids = report.cases[0].retrieved_ids;
    expect(new Set(ids).size).toBe(ids.length);
  }, 30000);

  it('supports semantic mode with an embedder for relevancy scoring', async () => {
    const provider = new HashEmbeddingProvider(64);
    const report = await runEvaluation(
      { ...DATASET, top_k: 2 },
      vectorStoreRetriever(store, 'semantic'),
      { embed: (texts) => provider.embed(texts) },
    );
    const electric = report.cases.find((c) => c.id === 'q-electric')!;
    expect(electric.answer_relevancy).not.toBeNull();
    expect(electric.answer_relevancy!).toBeGreaterThan(0.2);
  }, 30000);

  it('handles datasets whose cases have no gold labels', async () => {
    const noGold: EvalDataset = {
      ...DATASET,
      cases: [{ id: 'open', query: 'anything at all', relevant_ids: [] }],
    };
    const report = await runEvaluation(noGold, vectorStoreRetriever(store));
    expect(report.aggregate.recall_at_k).toBe(0);
    expect(report.cases[0].recall_at_k).toBeNull();
  });
});
