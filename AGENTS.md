# AGENTS.md

## Mission

ModelVerse is a real, self-hosted product: a **modern web UI for local LLM inference** that orchestrates 7 backends (llama.cpp, Ollama, LM Studio, OpenAI-compatible, KoboldCpp, vLLM, Transformers.js) with plugins, a ReAct + function-calling agent, RAG, model scanning/download, profiles, prompt library, eval A/B, metrics and auth. It is not a scaffold or demo — work like electricity is on: **breaking the server breaks a running user session.**

Golden rules: zero-warning lint (`npm run lint` = `--max-warnings 0`), conventional commits (enforced by commitlint), and parity between what docs claim and what code does.

## Non-negotiable rules

1. No secrets in code. Engine keys (`OPENAI_API_KEY`), auth files (`AUTH_STORE_FILE`, `AUTH_SECRET_FILE`) and local user data never enter git — see `.env.example` and the ignore rules.
2. Architecture is intentional, do not "helpfully" rewrite it:
   - **Vanilla TS + DOM, no framework.** A React/Vue port is a maintainer-level decision, never an agent one.
   - Server (`server.ts`, ~1,500 L Express 5, ~52 REST/SSE endpoints) and browser (`public/src/` TS modules) are separate compilations (`tsconfig.server.json` vs `tsconfig.json`) — never merge their types or imports.
   - App state is the hand-rolled singleton `public/src/state.ts` + IndexedDB + localStorage. Keep that pattern or extend it deliberately; don't sprinkle module-global caches.
   - Build emits JS in place (`server.js`, `src/**/*.js`, `public/src/*.js`, all gitignored). Do not "fix" this without updating Dockerfile, `start.sh`/`start.bat`, and Playwright `webServer.command` — all three consume built JS.
3. `npm run build` (typecheck + emit) must pass before any commit; CI runs typecheck/lint/format/build/test/eval and a Playwright e2e job (`package.yml`/`release.yml` build on top of it).
4. XSS discipline: HTML is built by string concatenation. ALWAYS escape interpolated user content — `escapeHtml()` for attribute values like `aria-label`/`title` (currently violated in `public/src/main.ts:74`, `sidebar.ts:304-307`; don't add new instances).
5. Server writes into the repo tree at runtime (`settings.json`, `model-metadata.json`, `profiles/`, `prompts/`, `plugins.json`, `scanner-config.json`). Do not add another runtime-mutable file at repo root without explaining its lifecycle; new runtime state belongs under a gitignored `data/` path.
6. Do not bump Express/Node majors, add UI frameworks, or remove `.husky` hooks in a feature commit.
7. Cover server logic with Vitest tests in `tests/` (12 files/~128 cases exist) and user-visible flows with Playwright specs in `e2e/` (3 specs/21 tests). Browser-side modules (`public/src`) currently have no unit tests — if you touch auth/session logic there, add tests first or the maintainer will.
8. Eval floor is contractual: CI runs `npm run eval -- --fail-under 0.9` (`scripts/data/rag-eval-dataset.json`). Touching `src/eval/*`, embeddings, or the RAG path requires re-running eval locally and explaining any drop.

## Docs drift to keep honest (skip if only passing by)

- `docs/Architecture.md` says "6 built-in plugins" — there are **7** (`server.ts`, `public` vendors…
  correct count any time you count). Backend route names: actual routes are
  `GET /api/scanner/scan`, `POST /api/profiles/save`, `PUT /api/metadata/:id` (and `/api/server/switch|/select` on engine switch). Fix on sight when making related changes.
- `docs/Frontend.md` describes index.html as "with `<div id="app">` mount point" (false — static `.app` shell), says "25 TS modules/14 stylesheets" (29/16), and claims `state.ts` holds `settings` (it doesn't — settings live in server `settings.json` + settings module).

## Repo facts agents must know

- `vendor/` libs are gitignored and copied postinstall by `scripts/vendor.mjs` (`npm run vendor`) — pdfjs/mathjax/highlight/jszip/mammoth/xlsx. Committed equivalents: `public/vendor/libs/pdf.min.js(+worker)`.
- **Env vars:** `PORT` (`server.ts`), auth: `AUTH_STORE_FILE`, `AUTH_SECRET_FILE`, `ALLOW_PUBLIC_REGISTER`, engines: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OLLAMA_HOST`, `LMSTUDIO_HOST`, `KOBOLDCPP_HOST`, `VLLM_HOST`, scanner-discovery: `OLLAMA_MODELS`, `LLMODELS_PATH`, `TRANSFORMERS_CACHE`, `HF_HOME`. `.env` is gitignored but **nothing loads it** (no dotenv dep) — a future server dotenv hookup must be paired with cleaning the dead `.gitignore` line or loading it.
- `settings.json` at repo root is the server's **live runtime config** — the server rewrites it on engine switch/settings change (and thus dirties a fresh worktree after runs). e2e therefore has instances; a `settings.example.json` tracked alternative is on the ROADMAP. `model-metadata.json` likewise used to be tracked (machine paths leaked) — it is now untracked; the scanner regenerates it.
- Playwright e2e boots TWO servers: :3100 + isolated auth server on :3101 (`playwright.config.ts`); both run `node server.js`, so run `npm run build` first when testing locally.
- Release flow: tags trigger `release.yml` (git-cliff changelog from `cliff.toml` + per-OS package archives). There is no committed `CHANGELOG.md` by design — don't add one outside the generator.
- README's "Known Limitations" is a contract with users (Transformers.js stub, browser-local conversations, SVG-only icons). Changes there require a README + `docs/` edit in the same PR.
- `ws` is a declared-but-nice-to-have dependency for future WebSocket streaming (see README). Remove only while removing its planned feature.

## Coding standards

- Zero-warning ESLint (type-checked configs); test/e2e override blocks exist — keep new test files under those globs rather than loosening rules.
- Prettier on `*.ts` only (pinned via `format` script); committed files stay prettier-clean.
- Browser modules stay framework-free: strict TS (`noUnusedLocals/Parameters`), explicit types over `any`, `globals.d.ts` covers ambient globals.
- Naming: domain terms (engine/profile/prompt/plugin/eval) — never leak UI implementation names into server APIs.

## Commit guidelines

- Conventional commits only (commitlint): `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `build:`.
- `lint-staged` (pre-commit) + commitlint (commit-msg) are wired by husky. Don't use `--no-verify` except for trivial chores, and never for feature commits.
- One theme per commit; e2e-affecting commits include e2e run output in the PR body.

## AI workflow expectations

- Read `docs/Architecture.md`, `docs/Backend.md`, `docs/Frontend.md`, `docs/PluginAPI.md`, `docs/Evaluation.md` before engine/agent/plugin work.
- Never refactor engine adapters (`src/engines/*`) into an abstraction "simplification" — they are per-backend by requirement.
- Prefer incremental changes; when adding a new surface (endpoint or module), follow the module pattern + register wiring in `main.ts`/`server.ts` accordingly.

## Required outputs for significant work

1. Summary. 2. Why. 3. Risks/tradeoffs (auth/XSS/eval-floor/engine-parity). 4. Files affected (incl. docs). 5. Validation steps (list commands + results).

## Validation before completing anything

```bash
npm run typecheck   # both projects
npm run lint        # must be warning-free
npm run format      # prettier check
npm run build       # typecheck + emit JS
npm test            # vitest
npm run eval -- --fail-under 0.9   # only if eval path touched
npm run test:e2e    # build first; playwright config reuses servers when not CI
```

## Escalation

Stop and propose before touching: `src/auth.ts` (session/token logic), `server.ts` request limits (`express.json({limit:'10mb'})`) and static file serving, plugin runtime guardrails (`python-guardrails`, function-calling tool list), anything streaming SSE chat semantics, or any "Known Limitations" claim.
