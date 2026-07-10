# Architecture

ModelVerse is a single-page web application with a Node.js/Express backend. The server and client communicate over HTTP (REST + SSE).

## High-Level Overview

```
Browser (public/)
  │  HTTP / SSE
  ▼
Express Server (server.ts)
  ├── Engines (src/engines/)
  ├── Plugins (src/plugins/)
  ├── Profiles (src/profiles.ts)
  ├── Model Scanner (src/model-scanner.ts)
  └── Config Schemas (src/config-schemas.ts)
```

## Directory Layout

```
ModelVerse/
├── server.ts              # Express entry point
├── src/                   # Server-side TypeScript
│   ├── engines/           # LLM backend adapters (llama.cpp, Ollama, OpenAI, etc.)
│   ├── plugins/           # Plugin system + 6 built-in plugins
│   ├── config-schemas.ts  # Zod validation schemas
│   ├── profiles.ts        # Generation profile management
│   ├── model-metadata.ts  # Model metadata CRUD
│   ├── model-scanner.ts   # Filesystem model discovery
│   └── logger.ts          # File-based logging
├── public/                # Client-side SPA
│   ├── index.html         # App shell
│   ├── css/               # 14 stylesheets
│   ├── src/               # 25 TypeScript modules
│   └── vendor/            # Vendored third-party libs
├── profiles/              # 7 built-in generation profiles
├── scripts/               # Build/utility scripts
└── tests/                 # Vitest tests
```

## Data Flow

1. **Chat**: Client sends `POST /api/chat` with message history → Server enqueues in `RequestQueue` → Calls `engine.generate()` → Streams tokens back via SSE
2. **Model loading**: `POST /api/server/start` with model path → Server spawns binary or connects to remote API
3. **Status**: Client polls `GET /api/status` and `GET /api/system` every 3 seconds
4. **Persistence**: Conversations in IndexedDB (browser); profiles, settings, metadata on server filesystem

## Key Design Decisions

- **Multi-engine**: Switch between 7 LLM backends at runtime with no restart
- **SSE streaming**: Token-by-token output via Server-Sent Events
- **Serialized queue**: Only one generation runs at a time with cancellation support
- **Plugin isolation**: Plugins run in-process with no sandbox (intended for trusted code only)
