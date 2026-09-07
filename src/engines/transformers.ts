import {
  LLMEngine,
  type ModelInfo,
  type ChatMessage,
  type GenerateOptions,
  type GenerateResult,
  type HealthStatus,
  type EngineConfig,
} from './base';

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
    return Promise.resolve({ success: false });
  }

  stop(): Promise<{ success: boolean }> {
    this._running = false;
    return Promise.resolve({ success: true });
  }

  listModels(): Promise<ModelInfo[]> {
    return Promise.resolve([]);
  }

  generate(_messages: ChatMessage[], _options?: GenerateOptions): Promise<GenerateResult> {
    return Promise.reject(
      new Error(
        'Transformers.js engine is not implemented (not_configured). Full implementation requires @huggingface/transformers inference wiring.',
      ),
    );
  }

  health(): Promise<HealthStatus> {
    return Promise.resolve({
      status: 'error',
      engine: this.id,
      detail: 'Not implemented (not_configured)',
    });
  }
}
