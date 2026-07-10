"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransformersEngine = void 0;
const stream_1 = require("stream");
const base_1 = require("./base");
class TransformersEngine extends base_1.LLMEngine {
    id = 'transformers';
    name = 'Transformers.js';
    engineConfig = {
        model: 'Xenova/gpt2',
        device: 'cpu',
    };
    configure(config) {
        this.engineConfig = { ...this.engineConfig, ...config };
    }
    async start(_modelPath) {
        this._running = true;
        return { success: true };
    }
    async stop() {
        this._running = false;
        return { success: true };
    }
    async listModels() {
        return [];
    }
    async generate(messages, options) {
        const stream = new stream_1.Readable({ read() { } });
        (async () => {
            try {
                const prompt = messages.map((m) => `${m.role}: ${m.content}`).join('\n') + '\nassistant:';
                stream.push(`data: ${JSON.stringify({ choices: [{ delta: { content: `[Transformers.js] Model: ${this.engineConfig.model}\n\nPrompt received. Full implementation requires @huggingface/transformers.\n` } }] })}\n\n`);
                stream.push('data: [DONE]\n\n');
                stream.push(null);
            }
            catch (e) {
                stream.destroy(e);
            }
        })();
        return { stream };
    }
    async health() {
        return { status: 'ok', engine: this.id };
    }
}
exports.TransformersEngine = TransformersEngine;
