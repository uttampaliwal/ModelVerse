# DEPLOYMENT.md

## Model of deployment

One process: `node server.js` (serves API + static SPA). No external DB needed; state = JSON files. Node 22. Port 3000 by default (`PORT` env).

## Option A — Docker (recommended for self-host)

```bash
docker build -t modelverse .
docker run -p 3000:3000 \
  -v modelverse-models:/app/models \
  -v modelverse-logs:/app/logs \
  modelverse
```

- Multi-stage build on `node:22-slim`; build→`npm run build`, runtime installs prod deps only and ships compiled JS + `public/`.
- Volumes: `/app/models` (local model files or mount your engine's model dir), `/app/logs`.
- Env: `PORT=3000` baked; pass `OPENAI_API_*`/engine hosts/auth vars as needed (see `.env.example`).
- Healthcheck: `/api/version`.
- Runtime user-writable dirs (settings, metadata, prompts, plugins) live in the image's writable layer or mount explicitly — they're small, but persistent user settings need a volume or explicit env-pinned paths.

## Option B — Bare metal / bare node

```bash
git clone … && npm install && npm run build
node server.js            # PORT=3000
```

Or use `./start.sh` / `./start.bat` (installs prod deps and builds on first run). `start.bat` additionally auto-downloads llama.cpp on first launch; `start.sh` does not — pick one and document to your users if you script both.

## Config matrix (common env vars)

| Var | Purpose |
|---|---|
| `PORT` | server port (default 3000) |
| `AUTH_STORE_FILE`, `AUTH_SECRET_FILE` | auth store + HMAC secret paths (gitignored) |
| `ALLOW_PUBLIC_REGISTER` | open self-registration (default off) |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | OpenAI-compatible engine |
| `OLLAMA_HOST`, `LMSTUDIO_HOST`, `KOBOLDCPP_HOST`, `VLLM_HOST` | local engine hosts |
| `OLLAMA_MODELS`, `LLMODELS_PATH`, `TRANSFORMERS_CACHE`, `HF_HOME` | model discovery paths |

## Reverse proxy (production)

If exposing publicly (not the design target), do it behind a TLS-terminating proxy with:
- auth at proxy or at app (`ALLOW_PUBLIC_REGISTER` unset, guest routes reviewed)
- SSE-friendly buffering off for `/api/chat` and `/api/agent/*`
- CSP/security headers added at the proxy (see SECURITY.md — app does not set them)

## Local-only mode (default intent)

Run at 127.0.0.1, keep defaults, skip proxies. That's the tested deployment.

## CI artifact check

`package.yml` runs `npm run package` on ubuntu/windows/macos after CI and uploads `dist/*.zip` (portable archives). Use those instead of building on user machines when distributing.
