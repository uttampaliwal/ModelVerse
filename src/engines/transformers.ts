import {
  LLMEngine,
  type ModelInfo,
  type ChatMessage,
  type GenerateOptions,
  type GenerateResult,
  type HealthStatus,
  type EngineConfig,
} from './base';
import { toGenerator } from './stream-utils';

export interface TransformersConfig extends EngineConfig {
  model: string;
  device: string;
}

export class TransformersEngine extends LLMEngine {
  readonly id = 'transformers';
  readonly name = 'Transformers.js';

  protected engineConfig: TransformersConfig = {
    model: 'Xenova/gpt2',
    device: 'cpu',
  };

  configure(config: EngineConfig): void {
    this.engineConfig = { ...this.engineConfig, ...config };
  }

  async start(_modelPath: string): Promise<{ success: boolean; port?: number }> {
    this._running = true;
    return Promise.resolve({ success: true });
  }

  stop(): Promise<{ success: boolean }> {
    this._running = false;
    return Promise.resolve({ success: true });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([]);
  }

  generate(_messages: ChatMessage[], _options?: GenerateOptions): Promise<GenerateResult> {
    const text = `[Transformers.js] Model: ${this.engineConfig.model}\n\nPrompt received. Full implementation requires @huggingface/transformers.\n`;
    return Promise.resolve({ stream: toGenerator(text) });
  }

  health(): Promise<HealthStatus> {
    return Promise.resolve({ status: 'ok', engine: this.id });
  }
}
