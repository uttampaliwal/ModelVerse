# Roadmap

## v0.2 — Stability & Polish

- [x] End-to-end test suite (Playwright)
- [x] Error boundary UI for engine failures
- [x] Auto-update checker for new releases
- [x] Docker image for one-command deploy
- [x] Windows/Mac/Linux installers (portable zips via `npm run package`; see Releases)

## v0.3 — Intelligence

- [x] Tool-use support for LLM function calling
- [x] Multi-turn RAG (chat over documents)
- [ ] Custom plugin SDK / remote plugin API
- [ ] A/B comparison between models (retrieval A/B via `POST /api/eval/ab` done)
- [x] Prompt template library

## v0.4 — Collaboration

- [x] Multi-user with authentication (API-level; per-user server stores still open)
- [ ] Shared conversation links
- [ ] Collaborative prompt editing
- [ ] Usage analytics dashboard

## v1.0 — Production

- [ ] Plugin marketplace
- [ ] Fine-tuning integrations (LoRA, QLoRA)
- [ ] Multi-modal (image/video generation)
- [ ] WebSocket-based real-time sync
