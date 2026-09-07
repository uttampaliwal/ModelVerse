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

export interface VLLMConfig extends EngineConfig {
  baseUrl: string;
  model: string;
}

export class VLLMEngine extends LLMEngine {
  readonly id = 'vllm';
  readonly name = 'vLLM';

  private static readonly FETCH_TIMEOUT_MS = 30000;

  protected engineConfig: VLLMConfig = {
    baseUrl: process.env.VLLM_HOST || 'http://127.0.0.1:8000',
    model: 'default',
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
      const res = await fetch(`${this.engineConfig.baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(VLLMEngine.FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { data: Array<{ id: string; owned_by: string }> };
      return data.data.map((m) => ({
        name: m.id,
        id: m.id,
        size: 0,
        sizeFormatted: 'Served',
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
      const res = await fetch(`${this.engineConfig.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(VLLMEngine.FETCH_TIMEOUT_MS),
        body: JSON.stringify({
          model,
          messages,
          temperature: options?.temperature ?? 0.7,
          top_p: options?.topP ?? 0.9,
          max_tokens: options?.maxTokens ?? 4096,
          stream: false,
          tools: toOpenAITools(options.tools),
          tool_choice: 'auto',
        }),
      });
      if (!res.ok) throw new Error(`vLLM error ${res.status}`);
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
    const res = await fetch(`${this.engineConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(VLLMEngine.FETCH_TIMEOUT_MS),
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
      throw new Error(`vLLM error ${res.status}`);
    }

    return { stream: openaiStreamToGenerator(res) };
  }

  override supportsTools(): boolean {
    return true;
  }

  async health(): Promise<HealthStatus> {
    try {
      const res = await fetch(`${this.engineConfig.baseUrl}/v1/models`, {
        signal: AbortSignal.timeout(VLLMEngine.FETCH_TIMEOUT_MS),
      });
      if (res.ok) {
        return { status: 'ok', engine: this.id };
      }
      return { status: 'error', engine: this.id, detail: `HTTP ${res.status}` };
    } catch {
      return { status: 'error', engine: this.id, detail: 'Cannot reach vLLM' };
    }
  }
}
