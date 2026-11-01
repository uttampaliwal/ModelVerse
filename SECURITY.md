# Security

## Reporting

Open a GitHub Security Advisory (private) or contact the maintainer directly (see GitHub profile @uttampaliwal). Do not open a public issue with exploit details.

## Current posture

Self-hosted, single-operator product; strong-by-default posture, known gaps documented honestly:

**In place**

- Auth: scrypt-hashed users, HMAC-signed session tokens, tokens stored server-side (`AUTH_SECRET_FILE`), protected + guest routes separated (see `docs/Backend.md` + e2e auth checks).
- Path traversal guards on model/metadata endpoints (covered by `e2e/api.spec.ts`).
- Python-code plugin runs inside guardrails (`src/plugins/…` + `tests/python-guardrails.test.ts`: sandbox constraints).
- Docker image contains only built artifacts; local state (users.json, .auth-secret, settings.json, model-metadata.json) is dockerignored.
- Engine secrets (`OPENAI_API_KEY`) come from environment only; nothing is persisted to git.

**Known gaps (accepted for a localhost tool, fix before hosting publicly)**

- No CSP / X-Frame-Options / Referrer-Policy headers on static chat-app; `express.json({limit:'10mb'})` allows large bodies.
- Attribute interpolations of user content fixed (self-XSS class closed): recent-chats title (`main.ts`), code-block `data-lang`/label/icon fallback (`markdown.ts`). Unescaped-interpolation audit for new code continues via review (`esc`/`escapeHtml`).
- Auth token kept in localStorage client-side (`public/src/api.ts`).
- Brute-force cosine/vector-store is in-process (DoS-able at scale).
- CORS wildcard on the API.

## Rules for contributors

- Never commit: `users.json`, `.auth-secret`, `settings.json` (runtime), `model-metadata.json` (machine paths), `plugins.json`/`scanner-config.json` runtime data — gate by `.gitignore`, verify `.dockerignore` covers them.
- Keep request limits, auth checks, and plugin guardrails unchanged — they get worse silently and nobody notices.
- Adding endpoints: zod-validate the body and pick an auth route tier (public/protected) deliberately.
- Escape user-controlled interpolation in HTML (`escapeHtml`).
- `npm audit --audit-level=high` runs in CI (`continue-on-error`) — honor the terminal output when it matters, not just in CI logs.

## Review checklist

- [ ] no runtime state files added to git
- [ ] body/request limits & auth tier chosen deliberately for any new endpoint
- [ ] new template string interpolations escaped or justified
- [ ] no new machine-specific absolute paths in any tracked JSON
- [ ] e2e extended when auth/boundary behavior changes
