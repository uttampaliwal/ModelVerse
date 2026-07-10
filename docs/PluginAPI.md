# Plugin API

## Overview

The plugin system lets you extend ModelVerse with custom tools, commands, and event hooks. Plugins run in the server process and have full access to Node.js APIs.

**Plugin API Version**: `0.1.0`

## Core Concepts

### PluginManifest

Every plugin declares a manifest describing itself:

```typescript
interface PluginManifest {
  id: string; // unique identifier
  name: string; // human-readable name
  version: string; // plugin's own version (semver)
  apiVersion: string; // required plugin API version range (e.g. "^0.1.0")
  description: string;
  author: string;
  icon?: string;
  category: PluginCategory;
  enabled: boolean;
  settings?: PluginSettingDefinition[];
  dependencies?: string[];
}
```

### PluginInstance (the contract)

```typescript
interface PluginInstance {
  manifest: PluginManifest;
  tools: ToolDefinition[];
  commands: CommandDefinition[];
  hooks: HookDefinition[];
  activate(ctx: PluginContext): Promise<void>;
  deactivate(): Promise<void>;
}
```

### PluginContext (what the host gives your plugin)

```typescript
interface PluginContext {
  registerTool(tool: ToolDefinition): void;
  registerCommand(command: CommandDefinition): void;
  registerHook(hook: HookDefinition): void;
  getConfig(): Record<string, unknown>;
  setConfig(config: Record<string, unknown>): void;
  log(message: string): void;
}
```

## Writing a Plugin

Create a class that extends `Plugin`:

```typescript
import { Plugin, type PluginManifest } from './base';

export class MyPlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    apiVersion: '^0.1.0',
    description: 'Does something useful',
    author: 'You',
    category: 'utility',
    enabled: false,
  };

  async activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    this.registerTool({
      name: 'my_tool',
      description: 'Does a thing',
      parameters: {
        input: { type: 'string', description: 'Input value', required: true },
      },
      execute: async (params) => {
        return { success: true, output: `Hello ${params.input}` };
      },
    });
    ctx.log('MyPlugin activated');
  }

  async deactivate(): Promise<void> {
    this.tools = [];
  }
}
```

## Registration

In `server.ts`, import and register your plugin:

```typescript
import { MyPlugin } from './src/plugins/my-plugin';
plugins.register(MyPlugin);
```

## API Versioning

The host declares `PLUGIN_API_VERSION` in `src/plugins/base.ts`. When you call `plugins.register()`, the host checks that your `apiVersion` semver range is satisfied by the host's version. If incompatible, registration throws an error:

```
Plugin "My Plugin" requires plugin API ^2.0.0, but host supports 0.1.0
```

## HTTP Endpoints

| Method | Path                         | Description                                                  |
| ------ | ---------------------------- | ------------------------------------------------------------ |
| GET    | `/api/plugins`               | List all plugins with manifests and active status            |
| POST   | `/api/plugins/toggle`        | Enable/disable a plugin by ID                                |
| GET    | `/api/plugins/tools`         | List all active tools                                        |
| POST   | `/api/plugins/tools/execute` | Execute a tool by fully qualified name (`pluginId:toolName`) |

## Built-in Plugins

| Plugin           | Tools                                                   | Category   |
| ---------------- | ------------------------------------------------------- | ---------- |
| Image Generation | `generate_image`                                        | generation |
| Speech           | `text_to_speech`, `speech_to_text`                      | speech     |
| Web Search       | `web_search`, `fetch_url`                               | search     |
| RAG              | `ingest_document`, `search_knowledge`, `list_documents` | rag        |
| Python Execution | `execute_python`, `run_notebook`                        | code       |
| Vision           | `analyze_image`, `ocr_extract`, `describe_chart`        | vision     |
