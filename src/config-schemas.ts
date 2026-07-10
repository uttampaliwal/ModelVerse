import { z } from 'zod';
import fs from 'fs';
import { log } from './logger';

export const engineIdSchema = z.enum([
  'llamacpp',
  'ollama',
  'lmstudio',
  'openai',
  'transformers',
  'koboldcpp',
  'vllm',
]);

export const serverSettingsSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  activeEngine: engineIdSchema.default('llamacpp'),
  engineConfigs: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  temperature: z.number().min(0).max(2).default(0.7),
  topP: z.number().min(0).max(1).default(0.9),
  topK: z.number().int().min(0).default(40),
  repeatPenalty: z.number().min(0).max(2).default(1.1),
  maxTokens: z.number().int().min(1).default(4096),
  contextSize: z.number().int().min(1).default(8192),
  threads: z.number().int().min(0).default(4),
  gpuLayers: z.number().int().min(0).default(99),
  systemPrompt: z.string().default('You are a helpful assistant.'),
});

export const activeProfileSchema = z.object({
  profile: z.string().default('Balanced'),
});

export const profileSchema = z
  .object({
    name: z.string(),
    description: z.string().default(''),
    temperature: z.number().min(0).max(2).default(0.7),
    topP: z.number().min(0).max(1).default(0.9),
    topK: z.number().int().min(0).default(40),
    repeatPenalty: z.number().min(0).max(2).default(1.1),
    maxTokens: z.number().int().min(1).default(4096),
    contextSize: z.number().int().min(1).default(8192),
    threads: z.number().int().min(0).default(4),
    gpuLayers: z.number().int().min(0).default(99),
    systemPrompt: z.string().default('You are a helpful assistant.'),
  })
  .passthrough();

export const modelMetadataSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  provider: z.string(),
  parameters: z.string().optional(),
  quantization: z.string().optional(),
  architecture: z.string().optional(),
  contextLength: z.number().int().positive().optional(),
  vision: z.boolean().default(false),
  embedding: z.boolean().default(false),
  reasoning: z.boolean().default(false),
  tools: z.boolean().default(false),
  functionCalling: z.boolean().default(false),
  code: z.boolean().default(false),
  memoryRequired: z.string().optional(),
  recommendedGpu: z.string().optional(),
  recommendedRam: z.string().optional(),
  languages: z.array(z.string()).optional(),
  license: z.string().optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  source: z.string().optional(),
  family: z.string().optional(),
  addedAt: z.string(),
  updatedAt: z.string(),
});

export const modelMetadataArraySchema = z.array(modelMetadataSchema);

export const modelSourceSchema = z.enum([
  'lmstudio',
  'ollama',
  'llamacpp',
  'gpt4all',
  'jan',
  'openwebui',
  'transformers',
  'custom',
]);

export const scannerConfigSchema = z.object({
  customPaths: z.array(z.string()).default([]),
  enabledSources: z.array(modelSourceSchema).default([]),
});

export const pluginSettingsSchema = z.record(
  z.string(),
  z.object({
    enabled: z.boolean(),
    config: z.record(z.string(), z.unknown()),
  }),
);

export const documentChunkSchema = z.object({
  id: z.string(),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()),
});

export const documentChunkArraySchema = z.array(documentChunkSchema);

export const packageJsonSchema = z.object({
  version: z.string().optional(),
});

export type ServerSettingsInput = z.input<typeof serverSettingsSchema>;
export type ServerSettings = z.output<typeof serverSettingsSchema>;
export type Profile = z.output<typeof profileSchema>;
export type ModelMetadata = z.output<typeof modelMetadataSchema>;
export type ScannerConfig = z.output<typeof scannerConfigSchema>;

export function loadAndValidate<T>(
  schema: z.ZodType<T>,
  filePath: string,
  defaults: T,
  ctx: string,
): T {
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const result = schema.safeParse(raw);
      if (result.success) {
        return result.data;
      }
      log.error(`[${ctx}] Validation failed for ${filePath}: ${result.error.message}`);
    }
  } catch (e) {
    log.error(`[${ctx}] Failed to load ${filePath}`, e as Error);
  }
  return defaults;
}
