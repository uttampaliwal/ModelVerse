# Backend

## Entry Point

`server.ts` — Express.js server that serves the SPA and provides the REST/SSE API.

## Server Structure (`src/`)

### Engines (`src/engines/`)

Adapters for LLM backends. Each implements a common interface:

```typescript
abstract class LLMEngine {
  abstract start(model: string): Promise<void>;
  abstract stop(): Promise<void>;
  abstract generate(messages: ChatMessage[], options: GenerateOptions): AsyncGenerator<string>;
  abstract listModels(): Promise<ModelInfo[]>;
  abstract health(): Promise<HealthStatus>;
}
```

Supported engines: `llamacpp`, `ollama`, `lmstudio`, `openai`, `koboldcpp`, `vllm`, `transformers`.

### Plugins (`src/plugins/`)

Extensible plugin system. See [PluginAPI.md](PluginAPI.md).

### Config Schemas (`src/config-schemas.ts`)

Zod schemas for validating settings, profiles, metadata, and plugin config. The `loadAndValidate()` helper reads a JSON file, validates it against a schema, and returns defaults on failure.

### Profiles (`src/profiles.ts`)

Manages generation profiles (temperature, top_p, top_k, repeat_penalty, etc.). 7 built-in profiles stored as JSON in `profiles/`.

### Model Metadata (`src/model-metadata.ts`)

CRUD for model metadata — auto-detected parameters, quantization, architecture, capabilities.

### Model Scanner (`src/model-scanner.ts`)

Discovers models from 8 sources: LM Studio, Ollama, llama.cpp, GPT4All, Jan, Open WebUI, Transformers cache, custom paths.

### Logger (`src/logger.ts`)

Simple file-based logging with levels: `info`, `warn`, `error`, `server`.

## API Endpoints

| Method | Path                         | Description                      |
| ------ | ---------------------------- | -------------------------------- |
| GET    | `/api/version`               | App version from package.json    |
| GET    | `/api/engines`               | Available engines                |
| POST   | `/api/chat`                  | Send message, receive SSE stream |
| POST   | `/api/server/start`          | Load a model                     |
| POST   | `/api/server/stop`           | Unload model                     |
| GET    | `/api/status`                | Server/engine status             |
| GET    | `/api/system`                | System resources (GPU, RAM)      |
| GET    | `/api/models`                | Scanned models                   |
| POST   | `/api/models/scan`           | Trigger rescan                   |
| GET    | `/api/profiles`              | List profiles                    |
| POST   | `/api/profiles`              | Save a profile                   |
| DELETE | `/api/profiles/:name`        | Delete a profile                 |
| GET    | `/api/settings`              | Get settings                     |
| POST   | `/api/settings`              | Update settings                  |
| GET    | `/api/plugins`               | List plugins                     |
| POST   | `/api/plugins/toggle`        | Toggle plugin                    |
| GET    | `/api/plugins/tools`         | List plugin tools                |
| POST   | `/api/plugins/tools/execute` | Execute a tool                   |
| GET    | `/api/metadata`              | Get model metadata               |
| PUT    | `/api/metadata`              | Update model metadata            |
| DELETE | `/api/metadata/:id`          | Delete metadata                  |
| GET    | `/api/metadata/search`       | Search metadata                  |

## Request Queue

`server.ts` implements a serial request queue — only one generation runs at a time. Subsequent requests are queued and processed in order. Supports cancellation via an abort controller.
