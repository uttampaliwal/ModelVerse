"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.engines = void 0;
const llama_1 = require("./llama");
const ollama_1 = require("./ollama");
const lmstudio_1 = require("./lmstudio");
const openai_1 = require("./openai");
const transformers_1 = require("./transformers");
const koboldcpp_1 = require("./koboldcpp");
const vllm_1 = require("./vllm");
const engineClasses = {
    llamacpp: llama_1.LlamaCppEngine,
    ollama: ollama_1.OllamaEngine,
    lmstudio: lmstudio_1.LMStudioEngine,
    openai: openai_1.OpenAIEngine,
    transformers: transformers_1.TransformersEngine,
    koboldcpp: koboldcpp_1.KoboldCppEngine,
    vllm: vllm_1.VLLMEngine,
};
class EngineRegistry {
    engines = new Map();
    activeEngineId = 'llamacpp';
    get(id) {
        if (!this.engines.has(id)) {
            const EngineClass = engineClasses[id];
            if (!EngineClass) {
                throw new Error(`Unknown engine: ${id}`);
            }
            this.engines.set(id, new EngineClass());
        }
        return this.engines.get(id);
    }
    getActive() {
        return this.get(this.activeEngineId);
    }
    setActive(id) {
        if (!engineClasses[id]) {
            throw new Error(`Unknown engine: ${id}`);
        }
        this.activeEngineId = id;
    }
    getActiveId() {
        return this.activeEngineId;
    }
    listAvailable() {
        return Object.entries(engineClasses).map(([id, Cls]) => {
            const instance = new Cls();
            return { id, name: instance.name };
        });
    }
    async configure(id, config) {
        this.get(id).configure(config);
    }
    async healthAll() {
        const results = {};
        for (const [id, engine] of this.engines) {
            results[id] = await engine.health();
        }
        return results;
    }
}
exports.engines = new EngineRegistry();
