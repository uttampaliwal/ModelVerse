# DEVELOPMENT.md

## One-time setup

```bash
nvm use 20        # or 22; CI matrix covers Node 20 & 22
npm install       # postinstall vendors browser libs via scripts/vendor.mjs
npm run build     # emits server.js + src/**/*.js + public/src/*.js (gitignored)
```

## Everyday

```bash
npm run dev              # tsc -p tsconfig.server.json && node --watch server.js
                          # (server-only rebuild; browser TS rebuild with npm run build)
npm run typecheck        # browser + server projects
npm run lint             # eslint, zero-warning gate
npm run format           # prettier check (*.ts)
npm test                 # vitest
```

Open `http://localhost:3000`. Engine setup per backend is documented in README ("Quick Start" → engine table).

## Repo map

See ARCHITECTURE.md for full layout; quick nav:

- Server routes & middleware: `server.ts` (chat SSE at `/api/chat`, agents, scanner, profiles, prompts library, plugins, eval, auth, settings).
- Engine adapters: `src/engines/` — one file per backend; new backend = new adapter + `engines/index` wiring + README table update.
- Plugins: `src/plugins/` — 7 built-ins; plugin contract in `docs/PluginAPI.md`.
- Agent: `src/agent/react-agent.ts` (ReAct mode + native function-calling mode).
- Browser: `public/src/` — `main.ts` wiring/bootstrap; `chat.ts` streaming; `settings.ts` modal; `state.ts` (+ IndexedDB via `db.ts`).
- Eval: `src/eval/` + dataset in `scripts/data/rag-eval-dataset.json`.

## Runtime state lifecycle (important!)

Server reads/writes repo-root JSON as its database:

| File | Who owns it | Git status |
|---|---|---|
| `settings.json` | server settings + active engine rewrite | tracked today (dirties easily) |
| `model-metadata.json` | scanner/download + PUT /api/metadata | untracked (was leaking machine paths) |
| `profiles/*.json`, `prompts/*` | built-in seeds + runtime CRUD | tracked seeds; runtime additions appear in git status |
| `plugins.json`, `scanner-config.json` | enable/scan config | gitignored per `.gitignore` |
| `users.json`, `.auth-secret` | auth store | gitignored + dockerignored |

Rule: new runtime files must be gitignored + dockerignored from birth; seed files (profiles/prompts) may be tracked but expect runtime writes — treat them as data with code as default.

## Quality gates before commit

1. `npm run typecheck && npm run lint && npm run format` — CI mirrors these.
2. `npm test` for server code touched.
3. `npm run build` then `npm run test:e2e` for any user-visible flow (Playwright needs the built JS).
4. `npm run eval -- --fail-under 0.9` if embeddings/RAG/agent-path touched.

## Shipping

- `npm run package` → `dist/*.zip` per OS (used by `package.yml` CI).
- Releases: tag `v*` → `release.yml` generates changelog (git-cliff + `cliff.toml`) and attaches archives. Don't hand-edit generated release notes.
- Docker: `docker build -t modelverse .` (multi-stage; runtime = `node:22-slim` + prod deps + compiled JS).
