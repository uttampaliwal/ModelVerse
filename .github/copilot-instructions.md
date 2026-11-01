# Copilot instructions

Read `AGENTS.md` at the repo root first — it is the binding contract for AI-assisted work here.

Fast facts:

- Two TypeScript projects, never merge them: `server.ts` + `src/**` (Node, Express 5, `tsconfig.server.json`) and `public/src/**` (browser, vanilla DOM, `tsconfig.json`). Build emits JS in place; Dockerfile, start.sh/bat and Playwright all consume `node server.js`.
- Commands: `npm run typecheck`, `npm run lint` (zero warnings), `npm run format`, `npm run build`, `npm test` (vitest), `npm run test:e2e` (build first), `npm run eval -- --fail-under 0.9` when RAG/agent code touched.
- State: runtime JSON at repo root (settings.json, prompts/, profiles/, model-metadata.json — now untracked). New runtime files must be gitignored + dockerignored from birth.
- Security baseline: escape user-controlled HTML interpolation; zod-validate every request body; no new machine-specific absolute paths in tracked files; see SECURITY.md known gaps before "improving" limits.
- Docs: `docs/` is deep but partially drifted — plugin count is 7; routes: `GET /api/scanner/scan`, `POST /api/profiles/save`, `PUT /api/metadata/:id`. Correct related docs in the same PR.
- Conventional commits enforced by commitlint + husky. No UI framework migrations without maintainer approval.
