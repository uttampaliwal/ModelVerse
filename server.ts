import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { engines, type EngineId } from './src/engines/index';
import type { ChatMessage, GenerateOptions, ModelInfo } from './src/engines/base';
import { plugins } from './src/plugins/index';
import { ImageGenerationPlugin } from './src/plugins/image-generation';
import { SpeechPlugin } from './src/plugins/speech';
import { WebSearchPlugin } from './src/plugins/web-search';
import { RAGPlugin } from './src/plugins/rag';
import { PythonPlugin } from './src/plugins/python';
import { VisionPlugin } from './src/plugins/vision';
import { VectorStorePlugin } from './src/plugins/vector-store';
import { runFunctionAgent, runReActAgent, engineGenerateFn } from './src/agent/react-agent';
import { faithfulness } from './src/eval/metrics';
import { loadEvalDataset } from './src/eval/dataset';
import { ingestCorpus, runEvaluation, vectorStoreRetriever } from './src/eval/runner';
import { VectorStore } from './src/vector-store';
import { createEmbeddingProvider } from './src/embeddings';
import { cancelDownload, getDownload, listDownloads, startDownload } from './src/model-download';
import {
  listProfiles,
  getActiveProfile,
  setActiveProfile,
  saveProfile,
  deleteProfile,
} from './src/profiles';
import {
  getMetadata,
  getAllMetadata,
  updateMetadata,
  deleteMetadata,
  filterMetadata,
} from './src/model-metadata';
import {
  scanAllModels,
  getScannerConfig,
  updateScannerConfig,
  getAvailableSources,
} from './src/model-scanner';
import { log } from './src/logger';
import { serverSettingsSchema, packageJsonSchema, loadAndValidate } from './src/config-schemas';

export type ServerSettings = import('./src/config-schemas').ServerSettings;

interface ChatMessageDTO {
  role: string;
  content: unknown;
}

// ---------------------------------------------------------------------------
// Request Queue – serializes generation requests so only one runs at a time
// ---------------------------------------------------------------------------
interface QueueEntry {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  messages: ChatMessage[];
  options: GenerateOptions;
  res: express.Response;
  createdAt: Date;
  error?: string;
}

function sendSSE(res: express.Response, data: object): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// Phase 0 guardrails: caps prevent hung/oversized generations from blocking decisions.
export const CHAT_LIMITS = {
  maxMessages: 100,
  maxContentChars: 50000,
  maxTokensMin: 1,
  maxTokensMax: 32000,
  contextMin: 512,
  contextMax: 131072,
  requestTimeoutMs: 300000, // 5 min per generation
  agentInputMaxChars: 10000,
};

export function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

class RequestQueue {
  private entries: QueueEntry[] = [];
  private currentId: string | null = null;
  private processing = false;

  enqueue(messages: ChatMessage[], options: GenerateOptions, res: express.Response): QueueEntry {
    const isBusy = this.currentId !== null;
    const entry: QueueEntry = {
      id: crypto.randomUUID
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2),
      status: isBusy ? 'queued' : 'running',
      messages,
      options,
      res,
      createdAt: new Date(),
    };
    this.entries.push(entry);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Clean up on client disconnect
    res.on('close', () => {
      const idx = this.entries.indexOf(entry);
      if (idx !== -1) {
        const e = this.entries[idx];
        if (e.status === 'queued') {
          this.entries.splice(idx, 1);
          log.server('Client disconnected, removed queued request ' + entry.id);
        } else if (e.status === 'running') {
          // Don't remove running entry; the stream error handler will clean up
        }
      }
    });

    if (isBusy) {
      const pos = this.entries.filter((e) => e.status === 'queued').length;
      sendSSE(res, { queue: { status: 'queued', position: pos } });
      log.server('Request queued at position ' + pos + ' (' + entry.id + ')');
    } else {
      this.currentId = entry.id;
      sendSSE(res, { queue: { status: 'running' } });
      setImmediate(() => {
        void this.processEntry(entry);
      });
    }

    return entry;
  }

  private async processEntry(entry: QueueEntry): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    const engine = engines.getActive();
    if (!engine.running) {
      if (!entry.res.headersSent) {
        entry.res.setHeader('Content-Type', 'text/event-stream');
        entry.res.setHeader('Cache-Control', 'no-cache');
        entry.res.setHeader('Connection', 'keep-alive');
        entry.res.setHeader('X-Accel-Buffering', 'no');
      }
      sendSSE(entry.res, { queue: { status: 'error', message: 'Engine not running' } });
      entry.res.end();
      entry.status = 'failed';
      entry.error = 'Engine not running';
      this.currentId = null;
      this.processing = false;
      this.entries = this.entries.filter((e) => e.id !== entry.id);
      this.dequeueNext();
      return;
    }

    try {
      const result = await engine.generate(entry.messages, entry.options);

      try {
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          try {
            sendSSE(entry.res, { error: 'Generation timed out after 5 minutes' });
            entry.res.end();
          } catch {
            /* ignore: client may already be gone */
          }
        }, CHAT_LIMITS.requestTimeoutMs);
        try {
          for await (const token of result.stream) {
            if (entry.status === 'cancelled' || timedOut) break;
            if (token) {
              const ok = entry.res.write(
                `data: ${JSON.stringify({ choices: [{ delta: { content: token } }] })}\n\n`,
              );
              if (!ok) break; // client disconnected / backpressure
            }
          }
        } finally {
          clearTimeout(timer);
        }
        if (entry.status === 'cancelled') {
          entry.error = 'Cancelled';
          log.server('Stream cancelled (' + entry.id + ')');
          try {
            entry.res.end();
          } catch {
            /* ignore */
          }
        } else if (timedOut) {
          entry.status = 'failed';
          entry.error = 'Generation timed out';
        } else {
          try {
            entry.res.write('data: [DONE]\n\n');
            entry.res.end();
          } catch {
            /* ignore */
          }
          entry.status = 'completed';
          log.server('Stream complete');
        }
      } catch (streamErr) {
        log.error('Stream error', streamErr as Error);
        if (!entry.res.headersSent) {
          entry.res.status(500).json({ error: (streamErr as Error).message });
        } else {
          sendSSE(entry.res, { error: (streamErr as Error).message });
          entry.res.end();
        }
        entry.status = 'failed';
        entry.error = (streamErr as Error).message;
      }

      this.currentId = null;
      this.processing = false;
      this.entries = this.entries.filter((e) => e.id !== entry.id);
      this.dequeueNext();
    } catch (e) {
      log.error('Chat generate error', e as Error);
      if (!entry.res.headersSent) {
        entry.res.status(500).json({ error: (e as Error).message });
      } else {
        sendSSE(entry.res, { error: (e as Error).message });
        entry.res.end();
      }
      entry.status = 'failed';
      entry.error = (e as Error).message;
      this.currentId = null;
      this.processing = false;
      this.entries = this.entries.filter((e) => e.id !== entry.id);
      this.dequeueNext();
    }
  }

  private dequeueNext(): void {
    const next = this.entries.find((e) => e.status === 'queued');
    if (next) {
      next.status = 'running';
      this.currentId = next.id;
      sendSSE(next.res, { queue: { status: 'running' } });
      setImmediate(() => {
        void this.processEntry(next);
      });
    }
  }

  getStatus(): {
    current: string | null;
    entries: { id: string; status: string; createdAt: Date; position?: number }[];
  } {
    const entries = this.entries.map((e, i) => ({
      id: e.id,
      status: e.status,
      createdAt: e.createdAt,
      position:
        e.status === 'queued'
          ? this.entries.filter((x) => x.status === 'queued' && this.entries.indexOf(x) < i)
              .length + 1
          : undefined,
    }));
    return { current: this.currentId, entries };
  }

  cancel(id: string): boolean {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry || entry.status === 'completed' || entry.status === 'failed') return false;
    if (entry.status === 'queued') {
      entry.status = 'cancelled';
      try {
        entry.res.end();
      } catch {
        /* ignore */
      }
      const idx = this.entries.indexOf(entry);
      if (idx !== -1) this.entries.splice(idx, 1);
      return true;
    }
    // Running: flag cancellation; processEntry loop observes it and cleans up.
    entry.status = 'cancelled';
    return true;
  }
}

const requestQueue = new RequestQueue();

const SETTINGS_FILE = path.join(__dirname, 'settings.json');

function getDefaultSettings(): ServerSettings {
  const profile = getActiveProfile();
  return {
    port: 3000,
    activeEngine: 'llamacpp',
    engineConfigs: {},
    temperature: profile.temperature,
    topP: profile.topP,
    topK: profile.topK,
    repeatPenalty: profile.repeatPenalty,
    maxTokens: profile.maxTokens,
    contextSize: profile.contextSize,
    threads: profile.threads,
    gpuLayers: profile.gpuLayers,
    systemPrompt: profile.systemPrompt,
  };
}

let settings: ServerSettings = getDefaultSettings();

function loadSettings(): void {
  settings = loadAndValidate(serverSettingsSchema, SETTINGS_FILE, getDefaultSettings(), 'Settings');
  engines.setActive(settings.activeEngine);
  for (const [id, config] of Object.entries(settings.engineConfigs || {})) {
    try {
      engines.configure(id, config);
    } catch (e) {
      log.error('Engine configure error', e as Error);
    }
  }
}

function saveSettings(): void {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (e) {
    log.error('Error saving settings', e as Error);
  }
}

loadSettings();

function getGpuInfo(): { name: string; used: number; total: number; utilization: number } | null {
  try {
    const out = execSync(
      'nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader,nounits',
      { encoding: 'utf-8', timeout: 3000 },
    ).trim();
    const [name, used, total, utilization] = out.split(',').map((s: string) => s.trim());
    return {
      name,
      used: parseInt(used) * 1024 * 1024,
      total: parseInt(total) * 1024 * 1024,
      utilization: parseInt(utilization),
    };
  } catch {
    return null;
  }
}

function sanitizeMessages(messages: ChatMessageDTO[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  for (const msg of messages) {
    const last = result[result.length - 1];
    if (last && last.role === msg.role && msg.role !== 'system') {
      last.content = last.content + '\n\n' + String(msg.content);
    } else {
      result.push({ role: msg.role as ChatMessage['role'], content: String(msg.content) });
    }
  }
  return result;
}

// --- API Routes ---

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(
  express.static(path.join(__dirname, 'public'), { etag: false, lastModified: false, maxAge: 0 }),
);

app.get('/api/version', (_req: express.Request, res: express.Response) => {
  const pkg = loadAndValidate(
    packageJsonSchema,
    path.join(__dirname, 'package.json'),
    { version: '0.0.0' },
    'Package',
  );
  res.json({ version: pkg.version });
});

app.get('/api/engines', (_req: express.Request, res: express.Response) => {
  res.json({
    engines: engines.listAvailable(),
    active: engines.getActiveId(),
  });
});

app.post('/api/engines/switch', (req: express.Request, res: express.Response) => {
  const { engineId } = req.body as { engineId: string };
  try {
    engines.setActive(engineId);
    settings.activeEngine = engineId as EngineId;
    saveSettings();
    res.json({ success: true, active: engineId });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get('/api/models', async (_req: express.Request, res: express.Response) => {
  try {
    // Aggregate models across every registered engine so the UI can present a
    // single unified model list. Each ModelInfo keeps its `provider` set by the
    // engine, which the client uses to route selection.
    const models: ModelInfo[] = [];
    for (const { id } of engines.listAvailable()) {
      try {
        models.push(...(await engines.get(id).listModels()));
      } catch {
        // an unreachable engine (e.g. Ollama not running) contributes no models
      }
    }
    res.json({ models });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get('/api/status', async (_req: express.Request, res: express.Response) => {
  const engine = engines.getActive();
  const health = await engine.health();
  res.json({
    running: engine.running,
    engine: engines.getActiveId(),
    currentModel: engine.activeModel,
    health,
    port: settings.port,
  });
});

app.get('/api/system', (_req: express.Request, res: express.Response) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  res.json({
    gpu: getGpuInfo(),
    ram: { used: usedMem, total: totalMem },
  });
});

app.post('/api/server/start', async (req: express.Request, res: express.Response) => {
  try {
    const { modelPath } = req.body as { modelPath: string };
    if (typeof modelPath !== 'string' || !modelPath.trim()) {
      return res.status(400).json({ error: 'modelPath must be a non-empty string' });
    }
    if (modelPath.includes('..')) {
      return res.status(400).json({ error: 'Invalid model path' });
    }
    if (!fs.existsSync(modelPath)) {
      return res.status(400).json({ error: 'Model file not found' });
    }
    const ext = path.extname(modelPath).toLowerCase();
    if (ext !== '.gguf' && ext !== '.gguf_split') {
      return res.status(400).json({ error: 'Model must be a .gguf file' });
    }
    const engine = engines.getActive();
    const result = await engine.start(modelPath);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/server/stop', async (_req: express.Request, res: express.Response) => {
  try {
    const engine = engines.getActive();
    const result = await engine.stop();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/server/switch', (req: express.Request, res: express.Response) => {
  const { modelId } = req.body as { modelId?: string | null };
  try {
    const engine = engines.getActive();
    engines.setActiveModel(engines.getActiveId(), modelId ?? null);
    res.json({ success: true, currentModel: engine.activeModel });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.post('/api/server/select', async (req: express.Request, res: express.Response) => {
  const { id, provider } = req.body as { id?: string; provider?: string };
  try {
    if (!provider) {
      res.status(400).json({ error: 'provider is required' });
      return;
    }
    // Switching the active engine also switches the server. The previously
    // running engine is stopped so only one backend serves at a time.
    const prev = engines.getActive();
    // Await the stop so the old backend fully exits and releases its port
    // before we report success; otherwise a fast follow-up /api/server/start
    // can spawn the new process while the old one still holds the port,
    // causing the new backend to fail to bind ("disconnected").
    if (prev.running) await prev.stop();
    engines.setActive(provider);
    engines.setActiveModel(provider, id ?? null);
    settings.activeEngine = provider as EngineId;
    saveSettings();
    const engine = engines.getActive();
    if (provider !== 'llamacpp') {
      // API-style engines (Ollama, vLLM, LM Studio, OpenAI, KoboldCpp,
      // transformers) are external services: selecting one marks it running
      // without spawning a process. The local llama.cpp engine is started by
      // the client via /api/server/start so it can reload weights.
      await engine.start(id ?? '');
    }
    res.json({
      success: true,
      engine: provider,
      currentModel: engine.activeModel,
      running: engine.running,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

app.get('/api/settings', (_req: express.Request, res: express.Response) => {
  res.json(settings);
});

app.post('/api/settings', (req: express.Request, res: express.Response) => {
  const body = req.body as Record<string, unknown>;
  const sanitized: Record<string, string | number> = {};

  const stringFields: (keyof ServerSettings)[] = ['systemPrompt'];
  for (const f of stringFields) {
    const v = body[f];
    if (typeof v === 'string') {
      sanitized[f] = v.trim();
    }
  }

  const numFields: (keyof ServerSettings)[] = [
    'temperature',
    'topP',
    'topK',
    'repeatPenalty',
    'maxTokens',
    'contextSize',
  ];
  for (const f of numFields) {
    const v = body[f];
    if (v !== undefined) {
      const n = Number(v);
      if (!Number.isNaN(n)) sanitized[f] = n;
    }
  }

  settings = { ...settings, ...(sanitized as Partial<ServerSettings>) };
  // Propagate context/performance knobs into the local llama.cpp engine config
  // so a model re-load (re-select) spawns with the chosen context size. These
  // only take effect when the backend is (re)started, not on a running one.
  const cfg = settings.engineConfigs || (settings.engineConfigs = {});
  cfg.llamacpp = {
    ...cfg.llamacpp,
    contextSize: settings.contextSize,
    gpuLayers: settings.gpuLayers,
    threads: settings.threads,
  };
  try {
    engines.configure('llamacpp', cfg.llamacpp);
  } catch (e) {
    log.error('llama.cpp configure error', e as Error);
  }
  saveSettings();
  res.json({ success: true });
});

// --- Profile API ---

app.get('/api/profiles', (_req: express.Request, res: express.Response) => {
  const profiles = listProfiles();
  res.json({ profiles });
});

app.get('/api/profiles/active', (_req: express.Request, res: express.Response) => {
  const profile = getActiveProfile();
  res.json({ profile });
});

app.post('/api/profiles/switch', (req: express.Request, res: express.Response) => {
  const { name } = req.body as { name: string };
  const success = setActiveProfile(name);
  if (!success) {
    return res.status(404).json({ error: `Profile not found: ${name}` });
  }
  const profile = getActiveProfile();
  settings.temperature = profile.temperature;
  settings.topP = profile.topP;
  settings.topK = profile.topK;
  settings.repeatPenalty = profile.repeatPenalty;
  settings.maxTokens = profile.maxTokens;
  settings.contextSize = profile.contextSize;
  settings.threads = profile.threads;
  settings.gpuLayers = profile.gpuLayers;
  settings.systemPrompt = profile.systemPrompt;
  saveSettings();
  res.json({ success: true, profile });
});

app.post('/api/profiles/save', (req: express.Request, res: express.Response) => {
  const { name, ...data } = req.body as { name: string } & Partial<ServerSettings>;
  if (!name) {
    return res.status(400).json({ error: 'Profile name required' });
  }
  const profile = saveProfile(name, data);
  res.json({ success: true, profile });
});

app.delete('/api/profiles/:name', (req: express.Request, res: express.Response) => {
  const name = req.params.name as string;
  const success = deleteProfile(name);
  if (!success) {
    return res.status(404).json({ error: `Profile not found: ${name}` });
  }
  res.json({ success: true });
});

// --- Model Metadata API ---

app.get('/api/metadata', (_req: express.Request, res: express.Response) => {
  const metadata = getAllMetadata();
  res.json({ models: metadata });
});

app.get('/api/metadata/search', (req: express.Request, res: express.Response) => {
  const { q, architecture, quantization, vision, reasoning, code, tools, tags, languages } =
    req.query;

  const results = filterMetadata({
    query: q as string,
    architecture: architecture as string,
    quantization: quantization as string,
    vision: vision === 'true' ? true : vision === 'false' ? false : undefined,
    reasoning: reasoning === 'true' ? true : reasoning === 'false' ? false : undefined,
    code: code === 'true' ? true : code === 'false' ? false : undefined,
    tools: tools === 'true' ? true : tools === 'false' ? false : undefined,
    tags: tags ? (tags as string).split(',') : undefined,
    languages: languages ? (languages as string).split(',') : undefined,
  });

  res.json({ models: results, count: results.length });
});

app.get('/api/metadata/:id', (req: express.Request, res: express.Response) => {
  const meta = getMetadata(req.params.id as string);
  if (!meta) {
    return res.status(404).json({ error: 'Model not found' });
  }
  res.json({ model: meta });
});

app.put('/api/metadata/:id', (req: express.Request, res: express.Response) => {
  const updates = req.body as Partial<import('./src/model-metadata').ModelMetadata>;
  const updated = updateMetadata(req.params.id as string, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Model not found' });
  }
  res.json({ model: updated });
});

app.delete('/api/metadata/:id', (req: express.Request, res: express.Response) => {
  const success = deleteMetadata(req.params.id as string);
  if (!success) {
    return res.status(404).json({ error: 'Model not found' });
  }
  res.json({ success: true });
});

// --- Model Scanner API ---

app.get('/api/scanner/scan', (_req: express.Request, res: express.Response) => {
  const models = scanAllModels();
  res.json({ models, count: models.length });
});

app.get('/api/scanner/sources', (_req: express.Request, res: express.Response) => {
  const sources = getAvailableSources();
  res.json({ sources });
});

app.get('/api/scanner/config', (_req: express.Request, res: express.Response) => {
  const config = getScannerConfig();
  res.json({ config });
});

app.post('/api/scanner/config', (req: express.Request, res: express.Response) => {
  const updates = req.body as Partial<import('./src/model-scanner').ScannerConfig>;
  const config = updateScannerConfig(updates);
  res.json({ success: true, config });
});

// --- Model downloads (Hugging Face → local ./models) ---

app.post('/api/models/download', async (req: express.Request, res: express.Response) => {
  const body = req.body as { repo?: unknown; file?: unknown; filename?: unknown };
  try {
    const id = await startDownload({
      repo: typeof body.repo === 'string' ? body.repo : '',
      file: typeof body.file === 'string' ? body.file : '',
      filename: typeof body.filename === 'string' ? body.filename : undefined,
    });
    res.status(202).json({ id, status: 'downloading' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get('/api/models/download', (_req: express.Request, res: express.Response) => {
  res.json({ downloads: listDownloads() });
});

app.get('/api/models/download/:id', (req: express.Request, res: express.Response) => {
  const progress = getDownload(req.params.id as string);
  if (!progress) return res.status(404).json({ error: 'Download not found' });
  res.json(progress);
});

app.delete('/api/models/download/:id', (req: express.Request, res: express.Response) => {
  const ok = cancelDownload(req.params.id as string);
  if (!ok) return res.status(404).json({ error: 'Active download not found' });
  res.json({ success: true });
});

// --- Plugin API ---

plugins.register(ImageGenerationPlugin);
plugins.register(SpeechPlugin);
plugins.register(WebSearchPlugin);
plugins.register(RAGPlugin);
plugins.register(PythonPlugin);
plugins.register(VisionPlugin);
plugins.register(VectorStorePlugin);

plugins.activateAll().catch((e) => log.error('Plugins activation error', e));

app.get('/api/plugins', (_req: express.Request, res: express.Response) => {
  res.json({ pluginApiVersion: plugins.getApiVersion(), plugins: plugins.listAvailable() });
});

app.post('/api/plugins/toggle', async (req: express.Request, res: express.Response) => {
  const { pluginId } = req.body as { pluginId: string };
  try {
    const enabled = await plugins.toggle(pluginId);
    res.json({ success: true, enabled });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.get('/api/plugins/tools', (_req: express.Request, res: express.Response) => {
  const tools = plugins.getAllTools().map(({ pluginId, tool }) => ({
    pluginId,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  res.json({ tools });
});

app.post('/api/plugins/tools/execute', async (req: express.Request, res: express.Response) => {
  const { tool, params } = req.body as { tool: string; params: Record<string, unknown> };
  if (typeof tool !== 'string' || !tool.trim()) {
    return res.status(400).json({ success: false, error: 'Missing required field: tool' });
  }
  try {
    const result = await plugins.executeTool(tool, params || {});
    // Honest status codes: misconfiguration / validation failures are 400,
    // so agents and UI never mistake them for successful observations.
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Queue API ---

app.get('/api/queue', (_req: express.Request, res: express.Response) => {
  res.json(requestQueue.getStatus());
});

app.delete('/api/queue/:id', (req: express.Request, res: express.Response) => {
  const ok = requestQueue.cancel(req.params.id as string);
  if (!ok) return res.status(404).json({ error: 'Queued request not found' });
  res.json({ success: true });
});

app.post('/api/chat', (req: express.Request, res: express.Response) => {
  const body = req.body as {
    messages: ChatMessageDTO[];
    maxTokens?: number;
    contextSize?: number;
  };
  const { messages } = body;
  const engine = engines.getActive();

  if (!engine.running) {
    return res.status(503).json({ error: 'Engine not running' });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array' });
  }
  if (messages.length > CHAT_LIMITS.maxMessages) {
    return res.status(400).json({ error: `Too many messages (max ${CHAT_LIMITS.maxMessages})` });
  }
  const validRoles = new Set(['system', 'user', 'assistant']);
  for (const m of messages) {
    if (!m || typeof m.role !== 'string' || !validRoles.has(m.role)) {
      return res.status(400).json({ error: 'Each message needs a valid role' });
    }
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    if (content.length > CHAT_LIMITS.maxContentChars) {
      return res.status(400).json({
        error: `Message content too long (max ${CHAT_LIMITS.maxContentChars} chars)`,
      });
    }
  }

  const hasSystem = messages.length > 0 && messages[0].role === 'system';
  const allMessages = sanitizeMessages(
    hasSystem ? messages : [{ role: 'system', content: settings.systemPrompt }, ...messages],
  );

  // Prefer per-request values from the UI so a generation uses the context
  // size the user currently has set, falling back to saved server settings.
  const reqMaxTokens = clampNumber(
    body.maxTokens ?? settings.maxTokens,
    settings.maxTokens,
    CHAT_LIMITS.maxTokensMin,
    CHAT_LIMITS.maxTokensMax,
  );
  const reqContextSize = clampNumber(
    body.contextSize ?? settings.contextSize,
    settings.contextSize,
    CHAT_LIMITS.contextMin,
    CHAT_LIMITS.contextMax,
  );

  const opts: GenerateOptions = {
    temperature: settings.temperature,
    topP: settings.topP,
    topK: settings.topK,
    repeatPenalty: settings.repeatPenalty,
    maxTokens: reqMaxTokens,
    contextSize: reqContextSize,
  };

  requestQueue.enqueue(allMessages, opts, res);
});

app.post('/api/agent/run', async (req: express.Request, res: express.Response) => {
  const body = req.body as { input?: string; maxIterations?: number; mode?: string };
  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input) {
    return res.status(400).json({ error: 'Missing required field: input' });
  }
  if (input.length > CHAT_LIMITS.agentInputMaxChars) {
    return res.status(400).json({
      error: `Input too long (max ${CHAT_LIMITS.agentInputMaxChars} chars)`,
    });
  }
  const mode = body.mode === 'react' || body.mode === 'functions' ? body.mode : 'auto';

  const engine = engines.getActive();
  if (!engine.running) {
    return res.status(503).json({ error: 'Engine not running' });
  }

  const baseOptions: GenerateOptions = {
    temperature: settings.temperature,
    topP: settings.topP,
    topK: settings.topK,
    repeatPenalty: settings.repeatPenalty,
    maxTokens: settings.maxTokens,
    contextSize: settings.contextSize,
  };
  const maxIterations =
    typeof body.maxIterations === 'number' && body.maxIterations > 0
      ? Math.min(24, Math.floor(body.maxIterations))
      : undefined;

  const started = Date.now();
  try {
    // Native function calling when the engine supports it (auto default);
    // ReAct text loop otherwise. Explicit mode=react forces the fallback.
    const useFunctions = mode === 'functions' || (mode === 'auto' && engine.supportsTools());
    if (useFunctions && engine.supportsTools() && plugins.getAllTools().length > 0) {
      const result = await runFunctionAgent(
        input,
        {
          engine,
          options: baseOptions,
          listTools: () => plugins.getAllTools(),
          executeTool: (fullName, params) => plugins.executeTool(fullName, params),
        },
        { maxIterations },
      );
      log.server(
        `Agent run (functions) completed (${result.stoppedReason}, ${result.iterations} iterations, ${result.toolCalls} tool calls, ${Date.now() - started}ms)`,
      );
      res.json({ ...result, mode: 'functions' });
      return;
    }
    if (mode === 'functions') {
      return res.status(400).json({
        error: `Active engine (${engines.getActiveId()}) does not support native function calling`,
      });
    }
    const generate = engineGenerateFn(engine, baseOptions);
    const result = await runReActAgent(
      input,
      {
        generate,
        listTools: () => plugins.getAllTools(),
        executeTool: (fullName, params) => plugins.executeTool(fullName, params),
      },
      { maxIterations },
    );
    log.server(
      `Agent run (react) completed (${result.stoppedReason}, ${result.iterations} iterations, ${Date.now() - started}ms)`,
    );
    res.json({ ...result, mode: 'react' });
  } catch (e) {
    log.error('Agent run failed', e as Error);
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- RAG chat (multi-turn, cited) ---

interface RagChatMessageDTO {
  role: string;
  content: unknown;
}

function extractRagQuery(body: { input?: unknown; messages?: RagChatMessageDTO[] }): string | null {
  if (typeof body.input === 'string' && body.input.trim()) return body.input.trim();
  if (Array.isArray(body.messages)) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const m = body.messages[i];
      if (m && m.role === 'user' && typeof m.content === 'string' && m.content.trim()) {
        return m.content.trim();
      }
    }
  }
  return null;
}

app.post('/api/agent/rag-chat', async (req: express.Request, res: express.Response) => {
  const body = req.body as {
    input?: unknown;
    messages?: RagChatMessageDTO[];
    topK?: unknown;
    mode?: unknown;
    prompt?: unknown;
  };
  const query = extractRagQuery(body);
  if (!query) {
    return res.status(400).json({ error: 'Provide input or messages with a user turn' });
  }
  if (query.length > CHAT_LIMITS.agentInputMaxChars) {
    return res.status(400).json({
      error: `Input too long (max ${CHAT_LIMITS.agentInputMaxChars} chars)`,
    });
  }
  const topK = clampNumber(body.topK ?? 5, 5, 1, 20);
  const mode = body.mode === 'semantic' || body.mode === 'keyword' ? body.mode : 'hybrid';

  const engine = engines.getActive();
  if (!engine.running) {
    return res.status(503).json({ error: 'Engine not running' });
  }

  try {
    // Prefer the semantic vector store; fall back to keyword RAG when empty.
    let hits: Array<{ id: string; text: string; score: number }> = [];
    let retrievalMode = mode;
    const vectorResult = await plugins.executeTool('vector-store:vector_search', {
      query,
      top_k: topK,
      mode,
    });
    if (vectorResult.success && Array.isArray(vectorResult.output)) {
      hits = (vectorResult.output as Array<{ id: string; text: string; score: number }>).slice(
        0,
        topK,
      );
    }
    if (hits.length === 0) {
      const ragResult = await plugins.executeTool('rag:search_knowledge', {
        query,
        top_k: topK,
      });
      if (ragResult.success && Array.isArray(ragResult.output)) {
        hits = (ragResult.output as Array<{ id: string; content: string }>).map((r) => ({
          id: r.id,
          text: r.content,
          score: 1,
        }));
        retrievalMode = 'keyword';
      }
    }

    const contextBlock =
      hits.length > 0
        ? hits.map((h) => `[${h.id}] ${h.text}`).join('\n\n')
        : '(no retrieved context)';
    const history =
      Array.isArray(body.messages) && body.messages.length > 0
        ? (body.messages as ChatMessage[])
            .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
            .slice(-10)
            .map(
              (m) =>
                `${m.role === 'user' ? 'User' : 'Assistant'}: ${String(m.content).slice(0, 4000)}`,
            )
            .join('\n')
        : `User: ${query}`;
    const promptName = typeof body.prompt === 'string' ? body.prompt : 'rag-qa';
    const promptTemplate = loadPromptTemplate(promptName);
    const prompt = (promptTemplate ?? DEFAULT_RAG_PROMPT)
      .replace('{{context}}', contextBlock)
      .replace('{{input}}', `${history}\n\nCurrent question: ${query}`);

    const result = await engine.generate(
      [
        {
          role: 'system',
          content:
            'You answer using retrieved context with [doc-id] citations. Never invent sources.',
        },
        { role: 'user', content: prompt },
      ],
      {
        temperature: settings.temperature,
        topP: settings.topP,
        topK: settings.topK,
        repeatPenalty: settings.repeatPenalty,
        maxTokens: settings.maxTokens,
        contextSize: settings.contextSize,
        toolChoice: 'none',
      },
    );
    let answer = '';
    for await (const token of result.stream) answer += token;
    answer = answer.trim();

    res.json({
      answer,
      citations: hits.map((h) => ({ id: h.id, score: h.score, text: h.text.slice(0, 500) })),
      faithfulness: answer
        ? faithfulness(
            hits.map((h) => h.text),
            answer,
          )
        : 0,
      retrievalMode,
      prompt: promptTemplate ? promptName : 'default',
    });
  } catch (e) {
    log.error('RAG chat failed', e as Error);
    res.status(500).json({ error: (e as Error).message });
  }
});

// --- Prompt library (file-based, prompts/*.json with {name, description, template}) ---

const PROMPTS_DIR = path.join(__dirname, 'prompts');
const DEFAULT_RAG_PROMPT =
  'Answer the question using ONLY the context below. Cite sources inline as [doc-id]. If the context does not contain the answer, say so honestly.\n\nContext:\n{{context}}\n\nQuestion: {{input}}\n\nAnswer (with citations):';

function loadPromptTemplate(name: string): string | null {
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) return null;
  try {
    const file = path.join(PROMPTS_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
      template?: unknown;
    };
    return typeof raw.template === 'string' ? raw.template : null;
  } catch {
    return null;
  }
}

function listPrompts(): Array<{ name: string; description: string }> {
  try {
    if (!fs.existsSync(PROMPTS_DIR)) return [];
    return fs
      .readdirSync(PROMPTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(PROMPTS_DIR, f), 'utf-8')) as {
            name?: unknown;
            description?: unknown;
          };
          return {
            name: typeof raw.name === 'string' ? raw.name : f.replace(/\.json$/, ''),
            description: typeof raw.description === 'string' ? raw.description : '',
          };
        } catch {
          return null;
        }
      })
      .filter((p): p is { name: string; description: string } => p !== null);
  } catch {
    return [];
  }
}

app.get('/api/prompts', (_req: express.Request, res: express.Response) => {
  res.json({ prompts: listPrompts() });
});

app.get('/api/prompts/:name', (req: express.Request, res: express.Response) => {
  const template = loadPromptTemplate(req.params.name as string);
  if (!template) return res.status(404).json({ error: 'Prompt not found' });
  res.json({ name: req.params.name, template });
});

// --- Eval A/B comparison (retrieval modes/providers over the seed dataset) ---

app.post('/api/eval/ab', async (req: express.Request, res: express.Response) => {
  const body = req.body as {
    modeA?: unknown;
    modeB?: unknown;
    provider?: unknown;
    topK?: unknown;
  };
  const validModes = new Set(['hybrid', 'semantic', 'keyword']);
  const modeA =
    typeof body.modeA === 'string' && validModes.has(body.modeA) ? body.modeA : 'hybrid';
  const modeB =
    typeof body.modeB === 'string' && validModes.has(body.modeB) ? body.modeB : 'keyword';
  const providerId = body.provider === 'minilm' ? 'minilm' : 'hash';

  try {
    const dataset = loadEvalDataset(
      path.join(__dirname, 'scripts', 'data', 'rag-eval-dataset.json'),
    );
    const topK = clampNumber(body.topK ?? dataset.top_k, dataset.top_k, 1, 20);
    const provider = createEmbeddingProvider(providerId, 256);

    async function runOnce(mode: string): Promise<import('./src/eval/runner').EvalReport> {
      const storePath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), 'modelverse-eval-')),
        'store.json',
      );
      try {
        const store = new VectorStore(storePath, provider);
        await ingestCorpus(store, dataset.corpus);
        return await runEvaluation(
          { ...dataset, top_k: topK },
          vectorStoreRetriever(store, mode as 'hybrid' | 'semantic' | 'keyword'),
          { embed: (texts) => provider.embed(texts) },
        );
      } finally {
        try {
          fs.rmSync(path.dirname(storePath), { recursive: true, force: true });
        } catch {
          /* ignore temp cleanup */
        }
      }
    }

    const [reportA, reportB] = await Promise.all([runOnce(modeA), runOnce(modeB)]);
    const delta = (key: keyof typeof reportA.aggregate): number =>
      reportA.aggregate[key] - reportB.aggregate[key];
    res.json({
      provider: provider.name,
      topK,
      a: { mode: modeA, aggregate: reportA.aggregate, caseCount: reportA.case_count },
      b: { mode: modeB, aggregate: reportB.aggregate, caseCount: reportB.case_count },
      delta: {
        recall_at_k: delta('recall_at_k'),
        precision_at_k: delta('precision_at_k'),
        hit_rate_at_k: delta('hit_rate_at_k'),
        mrr_at_k: delta('mrr_at_k'),
        context_precision_at_k: delta('context_precision_at_k'),
        faithfulness: delta('faithfulness'),
      },
      winner:
        reportA.aggregate.recall_at_k === reportB.aggregate.recall_at_k
          ? 'tie'
          : reportA.aggregate.recall_at_k > reportB.aggregate.recall_at_k
            ? 'a'
            : 'b',
    });
  } catch (e) {
    log.error('Eval A/B failed', e as Error);
    res.status(500).json({ error: (e as Error).message });
  }
});

const PORT = process.env.PORT || settings.port;
const server = app.listen(PORT, () => {
  console.log(`\n  ModelVerse  ->  http://localhost:${PORT}`);
  console.log(`  Engine: ${engines.getActive().name}\n`);
  // Best-effort background warmup of the MiniLM embedding model so the first
  // semantic search does not pay the ~25MB download + load latency inline.
  setImmediate(() => {
    import('./src/embeddings')
      .then((m) => m.warmupMiniLM())
      .then(() => log.server('Embedding warmup complete'))
      .catch(() => undefined);
  });
});

server.on('error', (err) => {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    log.error(`Port ${PORT} is already in use. Another instance may be running.`);
  } else {
    log.error('Server failed to start', err);
  }
  process.exit(1);
});
