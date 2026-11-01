# Roadmap

Authoritative long-form roadmap: `docs/Roadmap.md`. This file is the engineering-debt queue, kept factual — check boxes in one place only.

## Engineering debt queue

- [ ] Security headers: add CSP/X-Frame-Options/Referrer-Policy to static responses (or document proxy-only path in SECURITY.md, which is currently the standing answer)
- [ ] Escape user-controlled attribute interpolations (`public/src/main.ts:74`, `public/src/sidebar.ts:304-307`); add eslint rule/test hook to prevent new ones
- [ ] Resolve static-cache contradiction: etag/max-age on Express static ↔ `sw.js` shell precache ↔ manual `?v=` busting — pick one freshness model + document
- [ ] Promote `settings.json` to `settings.example.json` tracked + runtime file gitignored under `data/` (code path update in `server.ts`)
- [ ] `prompts/` runtime-writes into a tracked directory (e2e does this too) — move runtime prompt store to `data/prompts/` with seeds read-once
- [ ] Consolidate `assets/logo.svg` into `public/icons/`; remove dead root `assets/` dir
- [ ] Move `scripts/data/rag-eval-dataset.json` to `src/eval/data/` (it is eval source data, not a script)
- [ ] Unify docs: README duplicates Contributing/Roadmap/FAQ sections already in `docs/` — pick index-level README + deep `docs/`
- [ ] Add browser-side (`public/src`) unit tests for chat/session-critical modules
- [ ] Bundle/minify browser assets (or at minimum, long-cache hashed assets) — 29 module fetches today
- [ ] Vector-store brute-force cosine: add ANN option or workload ceiling before promoting "RAG at scale" claims
- [ ] lint-staged `--max-warnings 250` → 0 once baseline warnings clear (keeps CI pipeline honest end-to-end)
- [ ] Dependabot added for npm + actions ecosystems; consider renovate-style grouped updates next
- [ ] CODEOWNERS + issue templates (repo is single-maintainer; low priority — document intent instead)
