# RAG Evaluation

ModelVerse ships a deterministic evaluation harness for its retrieval stack. It measures RAGAS-style quality metrics over the hybrid retrieval pipeline (semantic + keyword fused via Reciprocal Rank Fusion) without needing a running LLM engine.

## Quick Start

```bash
npm run build        # harness imports compiled output from src/
npm run eval         # runs scripts/evaluate.mjs on the seed dataset
```

Results print to the console and are written to `eval-results.json` (gitignored).

### Options

```bash
npm run eval -- --provider minilm          # real MiniLM embeddings (default: hash)
npm run eval -- --mode semantic            # hybrid | semantic | keyword
npm run eval -- --top-k 10                 # override dataset top_k
npm run eval -- --dataset path/to/dataset.json
npm run eval -- --out results.json
npm run eval -- --fail-under 0.9           # exit 1 if aggregate recall@k drops below 0.9 (CI gate)
```

## Metrics

| Metric                | What it measures                                                                |
| --------------------- | ------------------------------------------------------------------------------- |
| `recall@k`            | Fraction of gold document ids present in the top-k retrieved set                |
| `precision@k`         | Fraction of top-k retrievals that are gold                                      |
| `hit_rate@k`          | Binary: at least one gold doc in top-k                                          |
| `mrr@k`               | Reciprocal rank of the first gold hit                                           |
| `context_precision@k` | Average precision with binary relevance (RAGAS-style context precision)         |
| `faithfulness`        | Token-level support of each reference-answer sentence by the retrieved contexts |
| `answer_relevancy`    | Cosine similarity (or token F1 fallback) between question and reference answer  |

Chunk families (`docId#0`, `docId#1`, ...) collapse to their parent id before scoring, and cases without `relevant_ids` contribute `null` recall but still produce faithfulness/relevancy scores.

## Dataset Format

Datasets are JSON validated by `evalDatasetSchema` in `src/config-schemas.ts`. See [`scripts/data/rag-eval-dataset.json`](../scripts/data/rag-eval-dataset.json) for a complete example:

```json
{
  "name": "my-eval",
  "top_k": 5,
  "corpus": [{ "id": "doc-1", "text": "..." }],
  "cases": [
    {
      "id": "q-1",
      "query": "...",
      "relevant_ids": ["doc-1"],
      "answer": "reference answer used for faithfulness/relevancy"
    }
  ]
}
```

## Library API

The core lives in `src/eval/` and is importable independently of the CLI:

- `src/eval/metrics.ts` — pure metric functions (`recallAtK`, `mrrAtK`, `averagePrecisionAtK`, `faithfulness`, `answerRelevancy`, ...)
- `src/eval/dataset.ts` — `loadEvalDataset()` / `saveJsonReport()`
- `src/eval/runner.ts` — `runEvaluation(dataset, retrieveFn, { embed })`, plus `vectorStoreRetriever(store, mode)` and `ingestCorpus(store, corpus)` adapters

Any retrieval function of shape `(query, topK) => Promise<{ id, text, score }[]>` can be evaluated — including plugin tool calls over HTTP (`POST /api/plugins/tools/execute`) if black-box behavior is desired.

## Notes

- Default provider is the offline `hash` embedder so CI stays deterministic; pass `--provider minilm` to evaluate the production ONNX path (~25MB one-time download).
- The seed dataset shows the expected gap: MiniLM beats the hash embedder on every aggregate metric, which is exactly what the harness is designed to demonstrate.
