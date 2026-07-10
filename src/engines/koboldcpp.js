"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KoboldCppEngine = void 0;
const stream_1 = require("stream");
const base_1 = require("./base");
class KoboldCppEngine extends base_1.LLMEngine {
    id = 'koboldcpp';
    name = 'KoboldCpp';
    engineConfig = {
        baseUrl: process.env.KOBOLDCPP_HOST || 'http://127.0.0.1:5001',
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
        const lastMsg = messages[messages.length - 1];
        const prompt = lastMsg?.content || '';
        const res = await fetch(`${this.engineConfig.baseUrl}/api/v1/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prompt,
                max_length: options?.maxTokens ?? 1024,
                temperature: options?.temperature ?? 0.7,
            }),
        });
        if (!res.ok) {
            throw new Error(`KoboldCpp error ${res.status}`);
        }
        const data = await res.json();
        const text = data.results?.[0]?.text || '';
        const stream = new stream_1.Readable({ read() { } });
        (async () => {
            stream.push(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
            stream.push('data: [DONE]\n\n');
            stream.push(null);
        })();
        return { stream };
    }
    async health() {
        try {
            const res = await fetch(`${this.engineConfig.baseUrl}/api/v1/model`);
            if (res.ok) {
                return { status: 'ok', engine: this.id };
            }
            return { status: 'error', engine: this.id, detail: `HTTP ${res.status}` };
        }
        catch {
            return { status: 'error', engine: this.id, detail: 'Cannot reach KoboldCpp' };
        }
    }
}
exports.KoboldCppEngine = KoboldCppEngine;
