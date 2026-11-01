# Roadmap

Authoritative long-form roadmap: `docs/Roadmap.md`. This file is the engineering-debt queue, kept factual — check boxes in one place only.

## Engineering debt queue

- [ ] Security headers: add CSP/X-Frame-Options/Referrer-Policy to static responses (or document proxy-only path in SECURITY.md, which is currently the standing answer)
- [x] Escape user-controlled attribute interpolations — done: recent-chats title (`main.ts`) and code-block `data-lang`/lang label/`getLangIcon` fallback (`markdown.ts`). The `sidebar.ts:304-307` buttons were audited and are static ternaries (never user content). Still open: eslint rule/test hook to prevent new raw interpolations.
- [ ] Resolve static-cache contradiction: etag/max-age on Express static ↔ `sw.js` shell precache ↔ manual `?v=` busting — pick one freshness model + document
- [x] Promote `settings.json` → `settings.example.json` tracked template + runtime file `data/settings.json` under gitignored `data/` (code path update in `server.ts`: load falls back to defaults, save now mkdirs first).
- [ ] Dependabot grouping policy: major bumps in the `dev` group (e.g. `typescript@7` — incompatible with `typescript-eslint@8`) break the CI gate; consider `ignore` for majors or separate minor-patch/major groups so routine dev updates stay green.
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
