# TESTING.md

## Test pyramid (real counts)

| Layer | Tool | Location | Count |
|---|---|---|---|
| Server unit | Vitest (v8 coverage on `src/**`) | `tests/` | 12 files, ~128 cases |
| E2E | Playwright (chromium) | `e2e/` | 3 specs, 21 tests |
| Eval gate | repo eval runner | `src/eval/` | CI `--fail-under 0.9` |

Not covered today: browser-side modules (`public/src/*.ts`) have no unit tests — changes there need Playwright hooks.

## Commands

```bash
npm test            # vitest run
npm run test:coverage    # v8 coverage report for src/**
npm run test:e2e    # builds required first! webServer.command = node server.js
npm run eval -- --fail-under 0.9   # CI gate for eval floor
npm run typecheck   # browser + server projects
npm run lint        # zero-warning gate
```

## Playwright specifics

- Config spins **two servers**: :3100 (main) + :3101 (isolated auth with its own `AUTH_STORE_FILE`/`AUTH_SECRET_FILE`).
- `reuseExistingServer: !CI` — dev runs reuse a running server; CI starts fresh.
- Retries: 2 on CI only.
- e2e writes prompt fixtures into `prompts/` and cleans up; if you add a spec touching runtime files, follow the same pattern.

## Vitest conventions

- One file per server module (`tests/<module>.test.ts`), no live network: engines are stubbed; auth uses temp dirs; vector-store/embeddings are deterministic.
- Keep tests hermetic — no HH patches to global state (see `server.ts`? none — the server itself is not started in vitest).
- Coverage config targets `src/**` only; e2e/ and public/src excluded by design.

## Eval

- RAG/agent eval dataset: `scripts/data/rag-eval-dataset.json`; runner: `src/eval/*` (metrics + runner suites in `tests/eval-*`).
- CI treats < 0.9 as failure. If you intentionally change retrieval/embeddings, run eval locally, explain the delta in the PR, and update the dataset only when semantics change (not to raise the score).

## Coverage expectations

- Server modules: add tests for every new endpoint or module; keep existing suites green.
- Auth/plugin-python-guardrail changes: minimum one negative ("good user can't") test.
- No hard coverage % threshold yet (roadmap).
