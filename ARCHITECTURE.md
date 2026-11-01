# ARCHITECTURE.md

Fast, factual entry point. Longer deep-dives live in `docs/` (`Architecture.md`, `Backend.md`, `Frontend.md`, `PluginAPI.md`, `Evaluation.md`).

## What it is

Self-hosted chat UI + orchestration server for local LLM inference. One process: Express serves (~52 REST/SSE endpoints) and serves the static browser app from `public/`. Seven engine adapters share one chat surface; plugins extend server capabilities; a ReAct/function-calling agent runs server-side.

## Stack snapshot (real)

- **Server:** TypeScript + Express 5 + Zod 4. Auth = scrypt password hashing + HMAC tokens in gitignored file store (`src/auth.ts`). Windows/persistence via JSON files, no external DB.
- **Browser:** vanilla TypeScript, no framework, 29 modules compiled in place by `tsc` (build emits `.js` next to `.ts` — all gitignored). CSS split across 16 files in `public/css/`. PWA shell via `manifest.json` + `sw.js`.
- **State:** server = `data/settings.json` (runtime; tracked template `settings.example.json`) + `model-metadata.json` (scanner-regenerated, untracked) + `profiles/`, `prompts/`, `plugins.json`, `scanner-config.json` (runtime-mutable JSON); browser = `state.ts` singleton + IndexedDB conversations + localStorage settings cache.
- **ML deps:** `@huggingface/transformers` (MiniLM ONNX embeddings) for RAG; `pdfjs-dist`, `mammoth`, `xlsx`, `jszip`, `mathjax`, `highlight.js` (vendored into `public/vendor` postinstall by `scripts/vendor.mjs`).

## Layout

```
server.ts + src/         Express server + server modules
  src/engines/           11 files: llama.cpp, Ollama, LM Studio, OpenAI-compat, KoboldCpp,
                         vLLM, Transformers.js (+ discovery helpers)
  src/plugins/           7 built-in plugins (image-gen, speech, web-search, RAG,
                         python-exec, vision, vector-store) + PluginAPI base
  src/agent/react-agent.ts  ReAct + native function-calling modes
  src/eval/              A/B eval runner + metrics (CI gates on --fail-under 0.9)
  src/model-*            scanner/download/metadata (GGUF header parsing)
  src/auth.ts            users/token HMAC-file store
  src/embeddings.ts + vector-store.ts  brute-force cosine RAG
public/
  index.html             1,500-line static shell (chat, 6 modals, icons inline)
  src/                   29 browser TS modules (chat.ts, sidebar.ts, settings.ts, …)
  css/                   16 stylesheets
  vendor/libs/           vendored browser libs (pdf.js committed, rest copied postinstall)
profiles/ prompts/       built-in generation profiles (7) + seed prompt templates (4)
e2e/ tests/              Playwright (21) + Vitest (~128)
Dockerfile start.sh/bat  build node:22-slim; runtime: node server.js (port 3000)
```

## Request life-cycle (chat)

1. `POST /api/chat` (SSE) → engine adapter resolves model → generation → streamed deltas
2. metrics pipeline records tok/s & latency (`GET /api/metrics` dashboard)
3. browser `chat.ts` renders increments via markdown pipeline → `conversation.ts` persists IndexedDB
4. agents go through `/api/agent/run` / `/api/agent/rag-chat` (vector-store retrieval → ReAct loop)

## Known debts (fact-checked, prioritization in ROADMAP.md)

- No security headers/CSP in front of a 10 MB-capable JSON body + innerHTML chat render (TEST your PRs with `npm audit` and keep response sizes sane).
- Attribute interpolations of user content are now escaped (`main.ts` recent-chats title, `markdown.ts` code-block lang attrs/label/icon fallback); remaining XSS surface is the CSP-side gap above.
- Static serving disables etag/max-age while `sw.js` precaches the shell + manual `?v=` busting — inconsistent freshness model.
- `ws` dependency present but unused (reserved for future streaming).
- Browser-side modules lack unit tests (Vitest covers server `src/**` only).
- README/docs drift: fixed plugin count is 7; route names in docs were stale until this baseline.
