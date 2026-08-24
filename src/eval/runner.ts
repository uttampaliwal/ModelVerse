import type { EvalDataset } from '../config-schemas';
import type { VectorStore, SearchMode } from '../vector-store';
import {
  normalizeId,
  mean,
  precisionAtK,
  recallAtK,
  hitRateAtK,
  mrrAtK,
  averagePrecisionAtK,
  faithfulness,
  answerRelevancy,
} from './metrics';

export interface RetrievedChunk {
  id: string;
  text: string;
  score: number;
}

export type RetrieveFn = (query: string, topK: number) => Promise<RetrievedChunk[]>;

export interface CaseMetrics {
  id: string;
  query: string;
  relevant_ids: string[];
  retrieved_ids: string[];
  recall_at_k: number | null;
  precision_at_k: number;
  hit_rate_at_k: number;
  mrr_at_k: number;
  context_precision_at_k: number;
  faithfulness: number | null;
  answer_relevancy: number | null;
}

export interface EvalReport {
  dataset: string;
  description: string;
  top_k: number;
  case_count: number;
  cases: CaseMetrics[];
  aggregate: {
    recall_at_k: number;
    precision_at_k: number;
    hit_rate_at_k: number;
    mrr_at_k: number;
    context_precision_at_k: number;
    faithfulness: number;
    answer_relevancy: number;
  };
}

export interface RunEvalOptions {
  embed?: (texts: string[]) => Promise<number[][]>;
}

export function vectorStoreRetriever(store: VectorStore, mode: SearchMode = 'hybrid'): RetrieveFn {
  return async (query: string, topK: number) => {
    const hits = await store.search(query, topK, mode);
    return hits.map((hit) => ({
      id: hit.record.id,
      text: hit.record.text,
      score: hit.score,
    }));
  };
}

export async function ingestCorpus(
  store: VectorStore,
  corpus: Array<{ id: string; text: string }>,
): Promise<void> {
  for (const doc of corpus) {
    await store.upsert(doc.text, { eval_doc_id: doc.id }, doc.id);
  }
}

function uniqueById(ids: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of ids) {
    const id = normalizeId(raw);
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

export async function runEvaluation(
  dataset: EvalDataset,
  retrieve: RetrieveFn,
  options: RunEvalOptions = {},
): Promise<EvalReport> {
  const topK = dataset.top_k;

  const cases: CaseMetrics[] = [];
  for (const testCase of dataset.cases) {
    const chunks = await retrieve(testCase.query, topK);
    const retrievedIds = uniqueById(chunks.map((chunk) => chunk.id));
    const relevantIds = (testCase.relevant_ids ?? []).map(normalizeId);
    const hasGold = relevantIds.length > 0;
    const contextTexts = chunks.map((chunk) => chunk.text);

    cases.push({
      id: testCase.id,
      query: testCase.query,
      relevant_ids: relevantIds,
      retrieved_ids: retrievedIds,
      recall_at_k: hasGold ? recallAtK(retrievedIds, relevantIds, topK) : null,
      precision_at_k: precisionAtK(retrievedIds, relevantIds, topK),
      hit_rate_at_k: hitRateAtK(retrievedIds, relevantIds, topK),
      mrr_at_k: mrrAtK(retrievedIds, relevantIds, topK),
      context_precision_at_k: averagePrecisionAtK(retrievedIds, relevantIds, topK),
      faithfulness:
        testCase.answer !== undefined ? faithfulness(contextTexts, testCase.answer) : null,
      answer_relevancy:
        testCase.answer !== undefined
          ? await answerRelevancy(testCase.query, testCase.answer, options.embed)
          : null,
    });
  }

  const pick = (key: keyof CaseMetrics): number[] =>
    cases.map((c) => c[key]).filter((value): value is number => typeof value === 'number');

  return {
    dataset: dataset.name,
    description: dataset.description,
    top_k: topK,
    case_count: cases.length,
    cases,
    aggregate: {
      recall_at_k: mean(pick('recall_at_k')),
      precision_at_k: mean(pick('precision_at_k')),
      hit_rate_at_k: mean(pick('hit_rate_at_k')),
      mrr_at_k: mean(pick('mrr_at_k')),
      context_precision_at_k: mean(pick('context_precision_at_k')),
      faithfulness: mean(pick('faithfulness')),
      answer_relevancy: mean(pick('answer_relevancy')),
    },
  };
}
