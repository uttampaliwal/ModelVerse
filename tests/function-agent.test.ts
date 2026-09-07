import { describe, it, expect } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  runFunctionAgent,
  toFunctionToolSpecs,
  type AgentToolInfo,
  type FunctionAgentDeps,
} from '../src/agent/react-agent';
import {
  parseOllamaToolCalls,
  parseOpenAIToolCalls,
  toOpenAITools,
} from '../src/engines/function-tools';
import type { LLMEngine } from '../src/engines/base';
import { OllamaEngine } from '../src/engines/ollama';
import { LMStudioEngine } from '../src/engines/lmstudio';
import { OpenAIEngine } from '../src/engines/openai';
import { VLLMEngine } from '../src/engines/vllm';
import { LlamaCppEngine } from '../src/engines/llama';
import { KoboldCppEngine } from '../src/engines/koboldcpp';
import { TransformersEngine } from '../src/engines/transformers';
import { loadEvalDataset } from '../src/eval/dataset';
import type { ToolResult } from '../src/plugins/base';

const TOOLS: AgentToolInfo[] = [
  {
    pluginId: 'web-search',
    tool: {
      name: 'web_search',
      description: 'Search the web',
      parameters: {
        query: { type: 'string', description: 'query', required: true },
        num_results: { type: 'number', description: 'count' },
      },
      execute: async () => ({ success: true }),
    },
  },
];

function fakeEngine(
  script: Array<{ text: string; calls?: Array<{ name: string; args: Record<string, unknown> }> }>,
): LLMEngine {
  let index = 0;
  return {
    supportsTools: () => true,
    generate: async () => {
      const step = script[Math.min(index++, script.length - 1)];
      return {
        stream: (async function* () {
          yield step.text;
        })(),
        toolCalls: (step.calls ?? []).map((c) => ({ name: c.name, arguments: c.args })),
      };
    },
  } as unknown as LLMEngine;
}

function deps(
  engine: LLMEngine,
  execute?: (_name: string, _params: Record<string, unknown>) => Promise<ToolResult>,
): FunctionAgentDeps {
  return {
    engine,
    options: {},
    listTools: () => TOOLS,
    executeTool: async (name, params) => {
      if (execute) return execute(name, params);
      return { success: true, output: `result for ${name}` };
    },
  };
}

describe('toFunctionToolSpecs', () => {
  it('maps required params and falls back unknown types to string', () => {
    const specs = toFunctionToolSpecs(TOOLS);
    expect(specs).toHaveLength(1);
    expect(specs[0].name).toBe('web_search');
    expect(specs[0].parameters.required).toEqual(['query']);
    expect(specs[0].parameters.properties.query).toEqual({
      type: 'string',
      description: 'query',
    });
    const wire = toOpenAITools(specs);
    expect(wire[0].type).toBe('function');
    expect(wire[0].function.name).toBe('web_search');
  });
});

describe('tool call parsing', () => {
  it('parses OpenAI JSON arguments and skips nameless calls', () => {
    const calls = parseOpenAIToolCalls([
      { id: '1', function: { name: 'web_search', arguments: '{"query":"hi"}' } },
      { id: '2', function: { arguments: '{}' } },
      { id: '3', function: { name: 'web_search', arguments: 'not json' } },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0].arguments).toEqual({ query: 'hi' });
    expect(calls[1].arguments).toMatchObject({ input: 'not json' });
  });

  it('parses Ollama object arguments', () => {
    const calls = parseOllamaToolCalls([
      { function: { name: 'web_search', arguments: { query: 'x' } } },
    ]);
    expect(calls[0]).toMatchObject({ name: 'web_search', arguments: { query: 'x' } });
  });
});

describe('engine supportsTools flags', () => {
  it('is true for OpenAI-compat engines, false for kobold/transformers', () => {
    expect(new OllamaEngine().supportsTools()).toBe(true);
    expect(new LMStudioEngine().supportsTools()).toBe(true);
    expect(new OpenAIEngine().supportsTools()).toBe(true);
    expect(new VLLMEngine().supportsTools()).toBe(true);
    expect(new LlamaCppEngine().supportsTools()).toBe(true);
    expect(new KoboldCppEngine().supportsTools()).toBe(false);
    expect(new TransformersEngine().supportsTools()).toBe(false);
  });
});

describe('runFunctionAgent', () => {
  it('calls a tool then answers', async () => {
    const engine = fakeEngine([
      { text: '', calls: [{ name: 'web_search', args: { query: 'tokyo weather' } }] },
      { text: 'Tokyo is sunny.' },
    ]);
    const seen: Array<{ name: string; params: Record<string, unknown> }> = [];
    const result = await runFunctionAgent(
      'weather in tokyo?',
      deps(engine, async (name, params) => {
        seen.push({ name, params });
        return { success: true, output: 'Sunny, 28C' };
      }),
    );
    expect(result.success).toBe(true);
    expect(result.answer).toBe('Tokyo is sunny.');
    expect(result.toolCalls).toBe(1);
    expect(seen).toEqual([{ name: 'web-search:web_search', params: { query: 'tokyo weather' } }]);
    expect(result.steps.map((s) => s.kind)).toEqual(['action', 'observation', 'final']);
  });

  it('recovers from unknown tools and finishes', async () => {
    const engine = fakeEngine([
      { text: '', calls: [{ name: 'nope', args: {} }] },
      { text: 'recovered' },
    ]);
    const result = await runFunctionAgent('hi', deps(engine));
    expect(result.success).toBe(true);
    expect(result.steps.some((s) => s.kind === 'error')).toBe(true);
  });

  it('rejects calls with missing required params without executing', async () => {
    const engine = fakeEngine([
      { text: '', calls: [{ name: 'web_search', args: {} }] },
      { text: 'done anyway' },
    ]);
    let executed = 0;
    const result = await runFunctionAgent(
      'hi',
      deps(engine, async () => {
        executed++;
        return { success: true, output: 'x' };
      }),
    );
    expect(executed).toBe(0);
    expect(result.success).toBe(true);
  });

  it('survives generate failures and continues', async () => {
    let calls = 0;
    const engine = {
      supportsTools: () => true,
      generate: async () => {
        calls++;
        if (calls === 1) throw new Error('backend hiccup');
        return {
          stream: (async function* () {
            yield 'final answer';
          })(),
          toolCalls: [],
        };
      },
    } as unknown as LLMEngine;
    const result = await runFunctionAgent('hi', deps(engine));
    expect(result.success).toBe(true);
    expect(result.steps.some((s) => s.kind === 'error')).toBe(true);
  });

  it('stops at max iterations', async () => {
    const engine = fakeEngine([
      { text: '', calls: [{ name: 'web_search', args: { query: 'loop' } }] },
    ]);
    const result = await runFunctionAgent('loop', deps(engine), { maxIterations: 2 });
    expect(result.stoppedReason).toBe('max_iterations');
    expect(result.success).toBe(false);
  });
});

describe('rag eval dataset v2', () => {
  it('loads and every relevant_id exists in the corpus', () => {
    const dataset = loadEvalDataset(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        'scripts',
        'data',
        'rag-eval-dataset.json',
      ),
    );
    expect(dataset.cases.length).toBeGreaterThanOrEqual(30);
    const corpusIds = new Set(dataset.corpus.map((d) => d.id));
    for (const c of dataset.cases) {
      for (const id of c.relevant_ids ?? []) {
        expect(corpusIds.has(id)).toBe(true);
      }
    }
  });
});
