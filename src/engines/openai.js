"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIEngine = void 0;
const stream_1 = require("stream");
const base_1 = require("./base");
class OpenAIEngine extends base_1.LLMEngine {
    id = 'openai';
    name = 'OpenAI';
    engineConfig = {
        apiKey: process.env.OPENAI_API_KEY || '',
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: 'gpt-4o',
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
            const res = await fetch(`${this.engineConfig.baseUrl}/models`, {
                headers: { Authorization: `Bearer ${this.engineConfig.apiKey}` },
            });
            if (!res.ok)
                return [];
            const data = await res.json();
            return data.data.map((m) => ({
                name: m.id,
                id: m.id,
                size: 0,
                sizeFormatted: 'Cloud',
                provider: this.id,
                capabilities: [],
            }));
        }
        catch {
            return [];
        }
    }
    async generate(messages, options) {
        const res = await fetch(`${this.engineConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.engineConfig.apiKey}`,
            },
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
            throw new Error(`OpenAI error ${res.status}`);
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
        if (!this.engineConfig.apiKey) {
            return { status: 'error', engine: this.id, detail: 'No API key configured' };
        }
        return { status: 'ok', engine: this.id };
    }
}
exports.OpenAIEngine = OpenAIEngine;
