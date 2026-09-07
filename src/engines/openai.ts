import {
  LLMEngine,
  type ModelInfo,
  type ChatMessage,
  type GenerateOptions,
  type GenerateResult,
  type HealthStatus,
  type EngineConfig,
  detectCapabilitiesFromName,
} from './base';
import { openaiStreamToGenerator } from './stream-utils';
import { parseOpenAIToolCalls, toOpenAITools, toolsResult } from './function-tools';

export interface OpenAIConfig extends EngineConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export class OpenAIEngine extends LLMEngine {
  readonly id = 'openai';
  readonly name = 'OpenAI';

  private static readonly FETCH_TIMEOUT_MS = 30000;

  protected engineConfig: OpenAIConfig = {
    apiKey: process.env.OPENAI_API_KEY || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: 'gpt-4o',
  };

  configure(config: EngineConfig): void {
    this.engineConfig = { ...this.engineConfig, ...config };
  }

  start(_modelPath: string): Promise<{ success: boolean; port?: number }> {
    this._running = true;
    return Promise.resolve({ success: true });
  }

  stop(): Promise<{ success: boolean }> {
    this._running = false;
    return Promise.resolve({ success: true });
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.engineConfig.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.engineConfig.apiKey}` },
        signal: AbortSignal.timeout(OpenAIEngine.FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data: Array<{ id: string; owned_by: string }> };
      return data.data.map((m) => ({
        name: m.id,
        id: m.id,
        size: 0,
        sizeFormatted: 'Cloud',
        provider: this.id,
        capabilities: detectCapabilitiesFromName(m.id),
      }));
    } catch {
      return [];
    }
  }

  async generate(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult> {
    const model = this._activeModel || this.engineConfig.model;
    if (options?.tools && options.tools.length > 0 && options.toolChoice !== 'none') {
      return this.generateWithTools(model, messages, options);
    }
    const res = await fetch(`${this.engineConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.engineConfig.apiKey}`,
      },
      signal: AbortSignal.timeout(OpenAIEngine.FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP ?? 0.9,
        max_tokens: options?.maxTokens ?? 4096,
        stream: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI error ${res.status}`);
    }

    return { stream: openaiStreamToGenerator(res) };
  }

  override supportsTools(): boolean {
    return true;
  }

  private async generateWithTools(
    model: string,
    messages: ChatMessage[],
    options: GenerateOptions,
  ): Promise<GenerateResult> {
    const res = await fetch(`${this.engineConfig.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.engineConfig.apiKey}`,
      },
      signal: AbortSignal.timeout(OpenAIEngine.FETCH_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        messages,
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP ?? 0.9,
        max_tokens: options?.maxTokens ?? 4096,
        stream: false,
        tools: toOpenAITools(options.tools ?? []),
        tool_choice: 'auto',
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI error ${res.status}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };
    const message = data.choices?.[0]?.message;
    return toolsResult(message?.content ?? '', parseOpenAIToolCalls(message?.tool_calls));
  }

  async health(): Promise<HealthStatus> {
    if (!this.engineConfig.apiKey) {
      return Promise.resolve({ status: 'error', engine: this.id, detail: 'No API key configured' });
    }
    try {
      const res = await fetch(`${this.engineConfig.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.engineConfig.apiKey}` },
        signal: AbortSignal.timeout(OpenAIEngine.FETCH_TIMEOUT_MS),
      });
      if (res.ok) return { status: 'ok', engine: this.id };
      return { status: 'error', engine: this.id, detail: `HTTP ${res.status}` };
    } catch (e) {
      return {
        status: 'error',
        engine: this.id,
        detail: (e as Error).name === 'TimeoutError' ? 'Timed out' : 'Cannot reach OpenAI',
      };
    }
  }
}
