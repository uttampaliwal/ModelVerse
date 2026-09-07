# Backend

## Entry Point

`server.ts` — Express.js server that serves the SPA and provides the REST/SSE API.

## Server Structure (`src/`)

### Engines (`src/engines/`)

Adapters for LLM backends. Each implements a common interface:

```typescript
abstract class LLMEngine {
  abstract start(model: string): Promise<void>;
  abstract stop(): Promise<void>;
  abstract generate(messages: ChatMessage[], options: GenerateOptions): AsyncGenerator<string>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract health(): Promise<HealthStatus>;
}
```

Supported engines: `llamacpp`, `ollama`, `lmstudio`, `openai`, `koboldcpp`, `vllm`, `transformers`.

### Plugins (`src/plugins/`)

Extensible plugin system. See [PluginAPI.md](PluginAPI.md).

### Vector Store (`src/vector-store.ts`)

Persistent embedding store used by the Vector Store plugin:

- **Embedding providers** (`src/embeddings.ts`) — `minilm` runs all-MiniLM-L6-v2 locally via ONNX (transformers.js, 384-dim; downloads ~25MB on first use then offline). `hash` is a zero-dependency hashed bag-of-words fallback (256-dim default).
- **Chunked ingestion** — `upsert()` splits long texts into overlapping chunks (`1000` chars / `150` overlap by default); re-upserting an id replaces its whole chunk family.
- **Hybrid retrieval** — `search(query, topK, mode)` supports `semantic` (cosine), `keyword` (token overlap), and `hybrid` (default): Reciprocal Rank Fusion (`k=60`) over both ranked lists.
- Records persist as JSON validated by `vectorRecordArraySchema`; records from mismatched providers/dimensions are ignored at load and search time.
- Retrieval is brute-force cosine over the in-memory corpus — fine at small N; an ANN/HNSW index can be swapped in behind the same interface if scale demands it.

### Evaluation (`src/eval/`)

RAGAS-style evaluation harness over hybrid retrieval: recall@k, precision@k, MRR, context precision, faithfulness, and answer relevancy. CLI via `npm run eval` (see [Evaluation.md](Evaluation.md)).

### Agent (`src/agent/react-agent.ts`)

Two agent modes share the same plugin tools:

- **Native function calling** (`runFunctionAgent`, default when the engine reports `supportsTools()`): plugin tools are converted to OpenAI-compatible specs (`src/engines/function-tools.ts`) and sent as `tools` with `tool_choice: auto` on llamacpp, ollama, lmstudio, openai, and vllm. Tools-mode requests are non-streaming so `tool_calls` parse reliably; results ride alongside the text stream in `GenerateResult.toolCalls`. KoboldCpp and Transformers.js report `supportsTools() === false`.
- **ReAct fallback** (`runReActAgent`): `Thought → Action → Action Input → Observation` text loop until `Final Answer:` or the iteration cap (default 8, max 24 via request).
- Both modes validate tool inputs, survive generate/tool throws, enforce a context budget, and truncate oversized observations.
- Endpoint: `POST /api/agent/run` with `{ input, maxIterations?, mode?: 'auto' | 'react' | 'functions' }` returns `{ success, answer, steps[], iterations, stoppedReason, mode }`; requires a running engine (503 otherwise).

### RAG chat (`POST /api/agent/rag-chat`)

Multi-turn cited chat over documents: accepts `{ input }` or `{ messages[] }` plus `{ topK?, mode?: 'hybrid' | 'semantic' | 'keyword', prompt? }`. Retrieves from the vector store (semantic/hybrid with RRF) with keyword-RAG fallback, injects `[doc-id]` context, generates with the active engine, and returns `{ answer, citations[], faithfulness, retrievalMode }`. Prompt templates live in `prompts/*.json` (`GET /api/prompts`, `GET /api/prompts/:name`).

### Eval A/B (`POST /api/eval/ab`)

Compares two retrieval modes over the seed dataset: `{ modeA?, modeB?, provider?: 'hash' | 'minilm', topK? }` returns per-mode aggregates, deltas, and a winner by recall@k.

### Config Schemas (`src/config-schemas.ts`)

Zod schemas for validating settings, profiles, metadata, and plugin config. The `loadAndValidate()` helper reads a JSON file, validates it against a schema, and returns defaults on failure.

### Profiles (`src/profiles.ts`)

Manages generation profiles (temperature, top_p, top_k, repeat_penalty, etc.). 7 built-in profiles stored as JSON in `profiles/`.

### Model Metadata (`src/model-metadata.ts`)

CRUD for model metadata — auto-detected parameters, quantization, architecture, capabilities.

### Model Scanner (`src/model-scanner.ts`)

Discovers models from 8 sources: LM Studio, Ollama, llama.cpp, GPT4All, Jan, Open WebUI, Transformers cache, custom paths.

### Logger (`src/logger.ts`)

Simple file-based logging with levels: `info`, `warn`, `error`, `server`.

## API Endpoints

| Method | Path                         | Description                      |
| ------ | ---------------------------- | -------------------------------- |
| GET    | `/api/version`               | App version from package.json    |
| GET    | `/api/update`                | Update check (cached 6h)         |
| GET    | `/api/engines`               | Available engines                |
| POST   | `/api/chat`                  | Send message, receive SSE stream |
| POST   | `/api/server/start`          | Load a model                     |
| POST   | `/api/server/stop`           | Unload model                     |
| GET    | `/api/status`                | Server/engine status             |
| GET    | `/api/system`                | System resources (GPU, RAM)      |
| GET    | `/api/models`                | Scanned models                   |
| POST   | `/api/models/scan`           | Trigger rescan                   |
| GET    | `/api/profiles`              | List profiles                    |
| POST   | `/api/profiles`              | Save a profile                   |
| DELETE | `/api/profiles/:name`        | Delete a profile                 |
| GET    | `/api/settings`              | Get settings                     |
| POST   | `/api/settings`              | Update settings                  |
| GET    | `/api/plugins`               | List plugins                     |
| POST   | `/api/plugins/toggle`        | Toggle plugin                    |
| GET    | `/api/plugins/tools`         | List plugin tools                |
| POST   | `/api/plugins/tools/execute` | Execute a tool                   |
| POST   | `/api/models/download`       | Download a model from HF (202)   |
| GET    | `/api/models/download`       | List downloads + progress        |
| GET    | `/api/models/download/:id`   | Download progress                |
| DELETE | `/api/models/download/:id`   | Cancel a download                |
| POST   | `/api/agent/run`             | Agent (functions/React modes)    |
| POST   | `/api/agent/rag-chat`        | Cited multi-turn RAG chat        |
| POST   | `/api/eval/ab`               | Compare retrieval modes          |
| GET    | `/api/prompts`               | List prompt templates            |
| GET    | `/api/prompts/:name`         | Get a prompt template            |
| GET    | `/api/metadata`              | Get model metadata               |
| PUT    | `/api/metadata`              | Update model metadata            |
| DELETE | `/api/metadata/:id`          | Delete metadata                  |
| GET    | `/api/metadata/search`       | Search metadata                  |

## Request Queue

`server.ts` implements a serial request queue — only one generation runs at a time. Subsequent requests are queued and processed in order. Supports cancellation via an abort controller.
