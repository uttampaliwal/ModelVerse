import { tokenize } from '../embeddings';

export function normalizeId(id: string): string {
  const hashIndex = id.indexOf('#');
  return hashIndex >= 0 ? id.slice(0, hashIndex) : id;
}

export function mean(values: number[]): number {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return 0;
  return finite.reduce((sum, v) => sum + v, 0) / finite.length;
}

export function precisionAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (k <= 0) return 0;
  const topK = retrievedIds.slice(0, k).map(normalizeId);
  const relevant = new Set(relevantIds.map(normalizeId));
  let hits = 0;
  for (const id of topK) if (relevant.has(id)) hits++;
  return hits / k;
}

export function recallAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0 || k <= 0) return 0;
  const topK = new Set(retrievedIds.slice(0, k).map(normalizeId));
  const relevant = relevantIds.map(normalizeId);
  let found = 0;
  for (const id of relevant) if (topK.has(id)) found++;
  return found / relevant.length;
}

export function hitRateAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0 || k <= 0) return 0;
  const topK = retrievedIds.slice(0, k).map(normalizeId);
  const relevant = new Set(relevantIds.map(normalizeId));
  return topK.some((id) => relevant.has(id)) ? 1 : 0;
}

export function mrrAtK(retrievedIds: string[], relevantIds: string[], k: number): number {
  if (relevantIds.length === 0 || k <= 0) return 0;
  const relevant = new Set(relevantIds.map(normalizeId));
  const topK = retrievedIds.slice(0, k).map(normalizeId);
  for (let rank = 0; rank < topK.length; rank++) {
    if (relevant.has(topK[rank])) return 1 / (rank + 1);
  }
  return 0;
}

export function averagePrecisionAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number,
): number {
  if (relevantIds.length === 0 || k <= 0) return 0;
  const relevant = new Set(relevantIds.map(normalizeId));
  const topK = retrievedIds.slice(0, k).map(normalizeId);
  let hits = 0;
  let sum = 0;
  for (let rank = 0; rank < topK.length; rank++) {
    if (relevant.has(topK[rank])) {
      hits++;
      sum += hits / (rank + 1);
    }
  }
  return sum / Math.min(relevant.size, k);
}

export function faithfulness(contextTexts: string[], answer: string): number {
  if (!answer.trim()) return 0;
  const contextTokens = new Set<string>();
  for (const text of contextTexts) {
    for (const token of tokenize(text)) contextTokens.add(token);
  }

  const sentences = answer
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length === 0) return 0;

  const supportRatios = sentences.map((sentence) => {
    const tokens = tokenize(sentence);
    if (tokens.length === 0) return 0;
    const supported = tokens.filter((token) => contextTokens.has(token)).length;
    return supported / tokens.length;
  });
  return mean(supportRatios);
}

export function tokenF1(a: string, b: string): number {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const setB = new Set(tokensB);
  let overlap = 0;
  for (const token of new Set(tokensA)) if (setB.has(token)) overlap++;

  const precision = overlap / tokensA.length;
  const recall = overlap / tokensB.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export async function answerRelevancy(
  question: string,
  answer: string,
  embed?: (texts: string[]) => Promise<number[][]>,
): Promise<number> {
  if (!question.trim() || !answer.trim()) return 0;
  if (!embed) return tokenF1(question, answer);

  const [questionVector] = await embed([question]);
  const [answerVector] = await embed([answer]);
  const dim = Math.min(questionVector.length, answerVector.length);
  let similarity = 0;
  for (let i = 0; i < dim; i++) similarity += questionVector[i] * answerVector[i];
  return Math.max(0, Math.min(1, similarity));
}
