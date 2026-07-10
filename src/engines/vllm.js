"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VLLMEngine = void 0;
const stream_1 = require("stream");
const base_1 = require("./base");
class VLLMEngine extends base_1.LLMEngine {
    id = 'vllm';
    name = 'vLLM';
    engineConfig = {
        baseUrl: process.env.VLLM_HOST || 'http://127.0.0.1:8000',
        model: 'default',
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
        try {
            const res = await fetch(`${this.engineConfig.baseUrl}/v1/models`);
            if (!res.ok)
                return [];
            const data = await res.json();
            return data.data.map((m) => ({
                name: m.id,
                id: m.id,
                size: 0,
                sizeFormatted: 'Served',
                provider: this.id,
                capabilities: [],
            }));
        }
        catch {
            return [];
        }
    }
    async generate(messages, options) {
        const res = await fetch(`${this.engineConfig.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.engineConfig.model,
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
        if (!res.body) {
            throw new Error('No response body');
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const stream = new stream_1.Readable({ read() { } });
        (async () => {
            try {
                let buffer = '';
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed)
                            stream.push(trimmed + '\n\n');
                    }
                }
                if (buffer.trim())
                    stream.push(buffer.trim() + '\n\n');
                stream.push(null);
            }
            catch (e) {
                stream.destroy(e);
            }
        })();
        return { stream };
    }
    async health() {
        try {
            const res = await fetch(`${this.engineConfig.baseUrl}/v1/models`);
            if (res.ok) {
                return { status: 'ok', engine: this.id };
            }
            return { status: 'error', engine: this.id, detail: `HTTP ${res.status}` };
        }
        catch {
            return { status: 'error', engine: this.id, detail: 'Cannot reach vLLM' };
        }
    }
}
exports.VLLMEngine = VLLMEngine;
