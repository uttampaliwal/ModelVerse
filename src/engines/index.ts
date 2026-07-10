import { LLMEngine, type EngineConfig, type EngineConstructor } from './base';
import { LlamaCppEngine } from './llama';
import { OllamaEngine } from './ollama';
import { LMStudioEngine } from './lmstudio';
import { OpenAIEngine } from './openai';
import { TransformersEngine } from './transformers';
import { KoboldCppEngine } from './koboldcpp';
import { VLLMEngine } from './vllm';

export type EngineId =
  'llamacpp' | 'ollama' | 'lmstudio' | 'openai' | 'transformers' | 'koboldcpp' | 'vllm';

const engineClasses: Record<EngineId, EngineConstructor> = {
  llamacpp: LlamaCppEngine,
  ollama: OllamaEngine,
  lmstudio: LMStudioEngine,
  openai: OpenAIEngine,
  transformers: TransformersEngine,
  koboldcpp: KoboldCppEngine,
  vllm: VLLMEngine,
};

class EngineRegistry {
  private engines = new Map<string, LLMEngine>();
  private activeEngineId: string = 'llamacpp';

  get(id: string): LLMEngine {
    if (!this.engines.has(id)) {
      const EngineClass = engineClasses[id as EngineId];
      if (!EngineClass) {
        throw new Error(`Unknown engine: ${id}`);
      }
      this.engines.set(id, new EngineClass());
    }
    return this.engines.get(id)!;
  }

  getActive(): LLMEngine {
    return this.get(this.activeEngineId);
  }

  setActive(id: string): void {
    if (!engineClasses[id as EngineId]) {
      throw new Error(`Unknown engine: ${id}`);
    }
    this.activeEngineId = id;
  }

  getActiveId(): string {
    return this.activeEngineId;
  }

  listAvailable(): Array<{ id: string; name: string }> {
    return Object.entries(engineClasses).map(([id, Cls]) => {
      const instance = new Cls();
      return { id, name: instance.name };
    });
  }

  configure(id: string, config: EngineConfig): void {
    this.get(id).configure(config);
  }

  async healthAll(): Promise<Record<string, { status: string; engine: string; detail?: string }>> {
    const results: Record<string, { status: string; engine: string; detail?: string }> = {};
    for (const [id, engine] of this.engines) {
      results[id] = await engine.health();
    }
    return results;
  }
}

export const engines = new EngineRegistry();
