import { describe, it, expect, vi } from 'vitest';
import {
  stripThinkBlocks,
  parseAgentOutput,
  buildAgentMessages,
  engineGenerateFn,
  runReActAgent,
  type AgentDeps,
  type AgentToolInfo,
} from '../src/agent/react-agent';
import type { ToolResult } from '../src/plugins/base';

const TOOLS: AgentToolInfo[] = [
  {
    pluginId: 'web-search',
    tool: {
      name: 'web_search',
      description: 'Search the web',
      parameters: {
        query: { type: 'string', description: 'query', required: true },
        results: { type: 'number', description: 'result count' },
      },
      execute: async () => ({ success: true }),
    },
  },
  {
    pluginId: 'rag',
    tool: {
      name: 'search_knowledge',
      description: 'Search knowledge base',
      parameters: { query: { type: 'string', description: 'query', required: true } },
      execute: async () => ({ success: true }),
    },
  },
];

function scriptedDeps(
  responses: string[],
  executeTool?: (_name: string, _params: Record<string, unknown>) => Promise<ToolResult>,
): AgentDeps & { calls: Array<{ name: string; params: Record<string, unknown> }> } {
  let index = 0;
  const calls: Array<{ name: string; params: Record<string, unknown> }> = [];
  const deps: AgentDeps = {
    generate: async () => responses[Math.min(index++, responses.length - 1)],
    listTools: () => TOOLS,
    executeTool: async (name, params) => {
      calls.push({ name, params });
      if (executeTool) return executeTool(name, params);
      return { success: true, output: `result for ${name}` };
    },
  };
  return { ...deps, calls };
}

describe('stripThinkBlocks', () => {
  it('removes reasoning tags and trims', () => {
    expect(stripThinkBlocks('<think>internal</think>Final Answer: hi')).toBe('Final Answer: hi');
    expect(stripThinkBlocks('no tags')).toBe('no tags');
  });
});

describe('parseAgentOutput', () => {
  it('parses final answers with optional thought', () => {
    const parsed = parseAgentOutput(
      'Thought: I know this.\nFinal Answer: Paris is the capital of France.',
    );
    expect(parsed.kind).toBe('final');
    expect(parsed.answer).toBe('Paris is the capital of France.');
    expect(parsed.thought).toBe('I know this.');
  });

  it('ignores think blocks around actions', () => {
    const parsed = parseAgentOutput(
      '<think>hmm</think>Thought: search\nAction: web-search:web_search\nAction Input: {"query": "weather tokyo"}',
    );
    expect(parsed.kind).toBe('action');
    expect(parsed.tool).toBe('web-search:web_search');
    expect(parsed.input).toEqual({ query: 'weather tokyo' });
  });

  it('uses the last action block when the model rambles', () => {
    const parsed = parseAgentOutput(
      'Action: web-search:web_search\nAction Input: {"query":"old"}\nActually:\nAction: rag:search_knowledge\nAction Input: {"query":"new"}',
    );
    expect(parsed.kind).toBe('action');
    expect(parsed.tool).toBe('rag:search_knowledge');
    expect(parsed.input).toEqual({ query: 'new' });
  });

  it('maps plain-string input onto the first required parameter', () => {
    const parsed = parseAgentOutput(
      'Thought: t\nAction: web_search\nAction Input: plain text query',
      TOOLS,
    );
    expect(parsed.kind).toBe('action');
    expect(parsed.input).toEqual({ query: 'plain text query' });
  });

  it('falls back to input key for unknown tools with string payloads', () => {
    const parsed = parseAgentOutput('Action: does_not_exist\nAction Input: hello world');
    expect(parsed.kind).toBe('action');
    expect(parsed.input).toEqual({ input: 'hello world' });
  });

  it('treats unstructured text without any action as a direct answer', () => {
    const parsed = parseAgentOutput('The answer is simply four.');
    expect(parsed.kind).toBe('final');
    expect(parsed.answer).toBe('The answer is simply four.');
  });

  it('handles quoted action names and missing action input', () => {
    const parsed = parseAgentOutput('Action: "rag:search_knowledge"\nAction Input:');
    expect(parsed.kind).toBe('action');
    expect(parsed.tool).toBe('rag:search_knowledge');
    expect(parsed.input).toEqual({});
  });
});

describe('buildAgentMessages', () => {
  it('lists fully qualified tools with parameters in system prompt', () => {
    const messages = buildAgentMessages('what time is it?', TOOLS);
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain(
      '- web-search:web_search(query: string, results?: number)',
    );
    expect(messages[0].content).toContain('Final Answer:');
    expect(messages[1].content).toBe('Question: what time is it?');
  });
});

describe('engineGenerateFn', () => {
  it('accumulates the token stream into a single string', async () => {
    const fakeEngine = {
      generate: async () => ({
        stream: (async function* () {
          yield 'Hel';
          yield 'lo ';
          yield 'world';
        })(),
      }),
    };
    const generate = engineGenerateFn(fakeEngine as never);
    await expect(generate([{ role: 'user', content: 'hi' }])).resolves.toBe('Hello world');
  });
});

describe('runReActAgent', () => {
  it('returns a direct final answer without calling tools', async () => {
    const deps = scriptedDeps(['Final Answer: Because two plus two is four.']);
    const result = await runReActAgent('why 2+2?', deps);
    expect(result.success).toBe(true);
    expect(result.stoppedReason).toBe('completed');
    expect(result.answer).toBe('Because two plus two is four.');
    expect(result.iterations).toBe(1);
    expect(deps.calls).toHaveLength(0);
  });

  it('executes a scripted search-then-summarize flow', async () => {
    const deps = scriptedDeps(
      [
        'Thought: I should look this up.\nAction: web-search:web_search\nAction Input: {"query": "tokyo weather"}',
        'Thought: Search says sunny. Final Answer: Tokyo weather is sunny today.',
      ],
      async () => ({ success: true, output: 'Sunny, 28C, light winds' }),
    );
    const result = await runReActAgent('weather in tokyo?', deps);

    expect(result.stoppedReason).toBe('completed');
    expect(result.answer).toBe('Tokyo weather is sunny today.');
    expect(deps.calls).toEqual([
      { name: 'web-search:web_search', params: { query: 'tokyo weather' } },
    ]);
    expect(result.steps.map((s) => s.kind)).toEqual([
      'thought',
      'action',
      'observation',
      'thought',
      'final',
    ]);
    const observation = result.steps.find((s) => s.kind === 'observation')!;
    expect(observation.result.output).toContain('Sunny');
  });

  it('chains multiple tools across iterations', async () => {
    const deps = scriptedDeps([
      'Action: web_search\nAction Input: {"query": "population paris"}',
      'Thought: got population, now check local notes.\nAction: rag:search_knowledge\nAction Input: {"query": "paris notes"}',
      'Thought: enough info\nFinal Answer: Paris has 2M residents per notes.',
    ]);
    const result = await runReActAgent('tell me about paris', deps);
    expect(result.iterations).toBe(3);
    expect(deps.calls.map((c) => c.name)).toEqual([
      'web-search:web_search',
      'rag:search_knowledge',
    ]);
    expect(result.answer).toContain('2M residents');
  });

  it('recovers from unknown tool errors and finishes', async () => {
    const deps = scriptedDeps([
      'Action: calculator:add\nAction Input: {"a": 1}',
      'Thought: wrong tool name, use search instead.\nAction: web_search\nAction Input: {"query": "fallback"}',
      'Final Answer: recovered fine',
    ]);
    const result = await runReActAgent('do math', deps);
    expect(result.success).toBe(true);
    expect(result.steps.some((s) => s.kind === 'error')).toBe(true);
    expect(deps.calls).toEqual([{ name: 'web-search:web_search', params: { query: 'fallback' } }]);
  });

  it('propagates tool failures as error observations', async () => {
    const deps = scriptedDeps(
      [
        'Action: web_search\nAction Input: {"query": "x"}',
        'Thought: failed but I know the answer anyway.\nFinal Answer: answered despite failure',
      ],
      async () => ({ success: false, error: 'network down' }),
    );
    const result = await runReActAgent('x?', deps);
    const observation = result.steps.find((s) => s.kind === 'observation')!;
    expect(observation.result.success).toBe(false);
    expect(observation.result.error).toBe('network down');
    expect(result.answer).toBe('answered despite failure');
  });

  it('stops at max iterations and reports the reason', async () => {
    const looping = 'Thought: hmm\nAction: web_search\nAction Input: {"query": "loop"}';
    const deps = scriptedDeps([looping]);
    const result = await runReActAgent('loop forever', deps, { maxIterations: 3 });
    expect(result.stoppedReason).toBe('max_iterations');
    expect(result.success).toBe(false);
    expect(result.iterations).toBe(3);
    expect(deps.calls).toHaveLength(3);
  });

  it('truncates oversized observations before feeding them back', async () => {
    const seenMessages: string[] = [];
    const base = scriptedDeps(
      ['Action: web_search\nAction Input: {"query": "big"}', 'Final Answer: done'],
      async () => ({ success: true, output: 'x'.repeat(10000) }),
    );
    const deps: AgentDeps = {
      ...base,
      generate: async (messages) => {
        seenMessages.push(messages[messages.length - 1].content);
        return base.generate(messages);
      },
    };
    vi.spyOn;
    await runReActAgent('big', deps, { maxObservationChars: 50 });
    expect(seenMessages[1].length).toBeLessThan(200);
    expect(seenMessages[1]).toContain('(truncated)');
  });

  it('resolves short tool names to their plugin-qualified form uniquely', async () => {
    const execute = vi.fn(async (): Promise<ToolResult> => ({ success: true, output: 'ok' }));
    const deps = scriptedDeps(
      ['Action: search_knowledge\nAction Input: {"query": "q"}', 'Final Answer: ok'],
      execute,
    );
    const result = await runReActAgent('q', deps);
    expect(execute).toHaveBeenCalledWith('rag:search_knowledge', { query: 'q' });
    expect(result.success).toBe(true);
  });
});
