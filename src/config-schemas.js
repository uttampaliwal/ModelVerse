"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.packageJsonSchema = exports.documentChunkArraySchema = exports.documentChunkSchema = exports.pluginSettingsSchema = exports.scannerConfigSchema = exports.modelSourceSchema = exports.modelMetadataArraySchema = exports.modelMetadataSchema = exports.profileSchema = exports.activeProfileSchema = exports.serverSettingsSchema = exports.engineIdSchema = void 0;
exports.loadAndValidate = loadAndValidate;
const zod_1 = require("zod");
const fs_1 = __importDefault(require("fs"));
const logger_1 = require("./logger");
exports.engineIdSchema = zod_1.z.enum([
    'llamacpp', 'ollama', 'lmstudio', 'openai', 'transformers', 'koboldcpp', 'vllm',
]);
exports.serverSettingsSchema = zod_1.z.object({
    port: zod_1.z.number().int().min(1).max(65535).default(3000),
    activeEngine: exports.engineIdSchema.default('llamacpp'),
    engineConfigs: zod_1.z.record(zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.unknown())).default({}),
    temperature: zod_1.z.number().min(0).max(2).default(0.7),
    topP: zod_1.z.number().min(0).max(1).default(0.9),
    topK: zod_1.z.number().int().min(0).default(40),
    repeatPenalty: zod_1.z.number().min(0).max(2).default(1.1),
    maxTokens: zod_1.z.number().int().min(1).default(4096),
    contextSize: zod_1.z.number().int().min(1).default(8192),
    threads: zod_1.z.number().int().min(0).default(4),
    gpuLayers: zod_1.z.number().int().min(0).default(99),
    systemPrompt: zod_1.z.string().default('You are a helpful assistant.'),
});
exports.activeProfileSchema = zod_1.z.object({
    profile: zod_1.z.string().default('Balanced'),
});
exports.profileSchema = zod_1.z.object({
    name: zod_1.z.string(),
    description: zod_1.z.string().default(''),
    temperature: zod_1.z.number().min(0).max(2).default(0.7),
    topP: zod_1.z.number().min(0).max(1).default(0.9),
    topK: zod_1.z.number().int().min(0).default(40),
    repeatPenalty: zod_1.z.number().min(0).max(2).default(1.1),
    maxTokens: zod_1.z.number().int().min(1).default(4096),
    contextSize: zod_1.z.number().int().min(1).default(8192),
    threads: zod_1.z.number().int().min(0).default(4),
    gpuLayers: zod_1.z.number().int().min(0).default(99),
    systemPrompt: zod_1.z.string().default('You are a helpful assistant.'),
}).passthrough();
exports.modelMetadataSchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    path: zod_1.z.string(),
    provider: zod_1.z.string(),
    parameters: zod_1.z.string().optional(),
    quantization: zod_1.z.string().optional(),
    architecture: zod_1.z.string().optional(),
    contextLength: zod_1.z.number().int().positive().optional(),
    vision: zod_1.z.boolean().default(false),
    embedding: zod_1.z.boolean().default(false),
    reasoning: zod_1.z.boolean().default(false),
    tools: zod_1.z.boolean().default(false),
    code: zod_1.z.boolean().default(false),
    memoryRequired: zod_1.z.string().optional(),
    recommendedGpu: zod_1.z.string().optional(),
    recommendedRam: zod_1.z.string().optional(),
    languages: zod_1.z.array(zod_1.z.string()).optional(),
    license: zod_1.z.string().optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    description: zod_1.z.string().optional(),
    source: zod_1.z.string().optional(),
    family: zod_1.z.string().optional(),
    addedAt: zod_1.z.string(),
    updatedAt: zod_1.z.string(),
});
exports.modelMetadataArraySchema = zod_1.z.array(exports.modelMetadataSchema);
exports.modelSourceSchema = zod_1.z.enum([
    'lmstudio', 'ollama', 'llamacpp', 'gpt4all', 'jan', 'openwebui', 'transformers', 'custom',
]);
exports.scannerConfigSchema = zod_1.z.object({
    customPaths: zod_1.z.array(zod_1.z.string()).default([]),
    enabledSources: zod_1.z.array(exports.modelSourceSchema).default([]),
});
exports.pluginSettingsSchema = zod_1.z.record(zod_1.z.string(), zod_1.z.object({
    enabled: zod_1.z.boolean(),
    config: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
}));
exports.documentChunkSchema = zod_1.z.object({
    id: zod_1.z.string(),
    content: zod_1.z.string(),
    metadata: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()),
});
exports.documentChunkArraySchema = zod_1.z.array(exports.documentChunkSchema);
exports.packageJsonSchema = zod_1.z.object({
    version: zod_1.z.string().optional(),
});
function loadAndValidate(schema, filePath, defaults, ctx) {
    try {
        if (fs_1.default.existsSync(filePath)) {
            const raw = JSON.parse(fs_1.default.readFileSync(filePath, 'utf-8'));
            const result = schema.safeParse(raw);
            if (result.success) {
                return result.data;
            }
            logger_1.log.error(`[${ctx}] Validation failed for ${filePath}: ${result.error.message}`);
        }
    }
    catch (e) {
        logger_1.log.error(`[${ctx}] Failed to load ${filePath}`, e);
    }
    return defaults;
}
