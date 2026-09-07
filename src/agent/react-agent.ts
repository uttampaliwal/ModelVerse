import type {
  ChatMessage,
  EngineToolCall,
  FunctionToolSpec,
  GenerateOptions,
  LLMEngine,
} from '../engines/base';
import type { ToolDefinition, ToolResult } from '../plugins/base';
import { toFunctionToolSpecs as convertToFunctionSpecs } from '../engines/function-tools';

export function toFunctionToolSpecs(tools: AgentToolInfo[]): FunctionToolSpec[] {
  return convertToFunctionSpecs(tools);
}

export interface AgentToolInfo {
  pluginId: string;
  tool: ToolDefinition;
}

export interface AgentDeps {
  generate: (messages: ChatMessage[]) => Promise<string>;
  listTools: () => AgentToolInfo[];
  executeTool: (fullName: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface AgentOptions {
  maxIterations?: number;
  maxObservationChars?: number;
  maxContextChars?: number;
}

export type AgentStep =
  | { kind: 'thought'; content: string }
  | { kind: 'action'; tool: string; input: Record<string, unknown>; thought?: string }
  | { kind: 'observation'; tool: string; result: ToolResult }
  | { kind: 'error'; content: string }
  | { kind: 'final'; answer: string };

export interface AgentRunResult {
  success: boolean;
  answer: string;
  steps: AgentStep[];
  iterations: number;
  stoppedReason: 'completed' | 'max_iterations' | 'invalid_output';
}

const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_MAX_OBSERVATION_CHARS = 4000;
const DEFAULT_MAX_CONTEXT_CHARS = 60000;

interface ParsedOutput {
  kind: 'final' | 'action';
  thought?: string;
  answer?: string;
  tool?: string;
  input?: Record<string, unknown>;
}

export function stripThinkBlocks(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractLabelled(text: string, label: string): string | null {
  const match = new RegExp(`${label}\\s*:\\s*`, 'i').exec(text);
  return match ? text.slice(match.index + match[0].length) : null;
}

export function parseAgentOutput(text: string, tools: AgentToolInfo[] = []): ParsedOutput {
  const cleaned = stripThinkBlocks(text);
  const finalMatch = /Final\s*Answer\s*:\s*([\s\S]*)$/i.exec(cleaned);
  if (finalMatch) {
    const before = cleaned.slice(0, finalMatch.index);
    const thought = /Thought\s*:\s*([\s\S]*?)\s*$/i.exec(before)?.[1]?.trim();
    return { kind: 'final', answer: finalMatch[1].trim(), thought: thought || undefined };
  }

  const actions = [...cleaned.matchAll(/Action\s*:\s*([^\n]+)/gi)];
  if (actions.length === 0) return { kind: 'final', answer: cleaned };

  const actionBlockStart = actions[actions.length - 1].index ?? 0;
  const beforeAction = cleaned.slice(0, actionBlockStart);
  const thoughtMatch = /Thought\s*:\s*([\s\S]*)/i.exec(beforeAction);
  const toolName = actions[actions.length - 1][1].trim().replace(/^["']|["']$/g, '');

  const inputText = extractLabelled(cleaned.slice(actionBlockStart), 'Action Input') ?? '';
  const input = parseActionInput(inputText.trim(), toolName, tools);

  return {
    kind: 'action',
    tool: toolName,
    input,
    thought: thoughtMatch?.[1]?.trim() || undefined,
  };
}

function parseActionInput(
  raw: string,
  toolName: string,
  tools: AgentToolInfo[],
): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through to plain-string handling */
  }
  const stripped = raw.replace(/^["']|["']$/g, '');
  const declared = tools.find(
    (t) => t.tool.name === toolName || `${t.pluginId}:${t.tool.name}` === toolName,
  );
  const firstRequired = Object.entries(declared?.tool.parameters ?? {}).find(
    ([, schema]) => schema.required,
  );
  const key = firstRequired ? firstRequired[0] : 'input';
  return { [key]: stripped };
}

function formatToolList(tools: AgentToolInfo[]): string {
  if (tools.length === 0) return '(no tools are currently active)';
  return tools
    .map(({ pluginId, tool }) => {
      const params = Object.entries(tool.parameters)
        .map(([name, schema]) => `${name}${schema.required ? '' : '?'}: ${schema.type}`)
        .join(', ');
      return `- ${pluginId}:${tool.name}(${params}): ${tool.description}`;
    })
    .join('\n');
}

export function buildAgentMessages(input: string, tools: AgentToolInfo[]): ChatMessage[] {
  const system = [
    'You are ModelVerse Agent, a helpful assistant that answers questions by using tools step by step.',
    '',
    'Available tools:',
    formatToolList(tools),
    '',
    'On each turn respond in EXACTLY one of these formats:',
    '',
    'Thought: <your reasoning about what to do next>',
    `Action: <tool name, e.g. web-search:web_search>`,
    'Action Input: <JSON object of tool parameters, e.g. {"query": "..."}>',
    '',
    'or, when you can answer without more information:',
    '',
    'Thought: <brief reasoning>',
    'Final Answer: <the complete answer for the user>',
    '',
    'Rules:',
    '- One Action per turn; you will receive an Observation with the result.',
    '- Prefer tools over guessing when they can provide facts.',
    '- Combine information from multiple tools when useful.',
    '- Never invent tool results. Always wait for the Observation.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: `Question: ${input}` },
  ];
}

export function engineGenerateFn(
  engine: LLMEngine,
  options: GenerateOptions = {},
): (messages: ChatMessage[]) => Promise<string> {
  return async (messages: ChatMessage[]) => {
    const result = await engine.generate(messages, options);
    let output = '';
    for await (const token of result.stream) output += token;
    return output;
  };
}

export function validateAgentToolInput(
  tools: AgentToolInfo[],
  fullName: string,
  input: Record<string, unknown>,
): string | null {
  const entry = tools.find((t) => `${t.pluginId}:${t.tool.name}` === fullName);
  if (!entry) return `Unknown tool: ${fullName}`;
  for (const [name, schema] of Object.entries(entry.tool.parameters ?? {})) {
    const value = input[name];
    if (schema.required && (value === undefined || value === null || value === '')) {
      return `Missing required parameter "${name}" for tool ${fullName}`;
    }
    if (value !== undefined && value !== null) {
      const actual = Array.isArray(value) ? 'array' : typeof value;
      if (schema.type === 'number' && actual === 'string' && !Number.isNaN(Number(value))) {
        continue;
      }
      if (schema.type !== 'any' && actual !== schema.type) {
        return `Invalid type for "${name}": expected ${schema.type}, got ${actual}`;
      }
    }
  }
  return null;
}

function totalContextChars(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n... (truncated)`;
}

export async function runReActAgent(
  input: string,
  deps: AgentDeps,
  options: AgentOptions = {},
): Promise<AgentRunResult> {
  const maxIterations = Math.min(24, Math.max(1, options.maxIterations ?? DEFAULT_MAX_ITERATIONS));
  const maxObservationChars = options.maxObservationChars ?? DEFAULT_MAX_OBSERVATION_CHARS;
  const maxContextChars = options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;

  const steps: AgentStep[] = [];
  const tools = deps.listTools();

  const resolveTool = (name: string): string | null => {
    if (tools.some((t) => `${t.pluginId}:${t.tool.name}` === name)) return name;
    const byShortName = tools.filter((t) => t.tool.name === name);
    return byShortName.length === 1
      ? `${byShortName[0].pluginId}:${byShortName[0].tool.name}`
      : null;
  };

  const messages: ChatMessage[] = buildAgentMessages(input, tools);
  let iterations = 0;
  let stoppedReason: AgentRunResult['stoppedReason'] = 'max_iterations';
  let lastAnswer = '';

  while (iterations < maxIterations) {
    iterations++;
    // Token/context guard: stop before the prompt grows unbounded.
    if (totalContextChars(messages) > maxContextChars) {
      steps.push({
        kind: 'error',
        content: `Context budget exceeded (${maxContextChars} chars). Stopping to avoid unbounded growth.`,
      });
      break;
    }
    let output: string;
    try {
      output = await deps.generate(messages);
    } catch (e) {
      const message = (e as Error).message || 'generate failed';
      steps.push({ kind: 'error', content: `Generate failed: ${message}` });
      messages.push({
        role: 'user',
        content: `Observation: Error - generate failed (${message}). Reply with a valid Action or a Final Answer.`,
      });
      continue;
    }
    const parsed = parseAgentOutput(output, tools);

    if (parsed.kind === 'final') {
      lastAnswer = parsed.answer ?? '';
      if (parsed.thought) steps.push({ kind: 'thought', content: parsed.thought });
      steps.push({ kind: 'final', answer: lastAnswer });
      stoppedReason = 'completed';
      break;
    }

    if (parsed.thought) steps.push({ kind: 'thought', content: parsed.thought });
    const fullName = resolveTool(parsed.tool ?? '');
    if (!fullName) {
      steps.push({ kind: 'error', content: `Unknown tool: ${parsed.tool}` });
      messages.push({ role: 'assistant', content: output });
      messages.push({
        role: 'user',
        content: `Observation: Error - unknown tool "${parsed.tool}". Available tools: ${tools.map((t) => `${t.pluginId}:${t.tool.name}`).join(', ')}. Reply with a valid Action or a Final Answer.`,
      });
      continue;
    }

    const toolInput = parsed.input ?? {};
    const inputError = validateAgentToolInput(tools, fullName, toolInput);
    if (inputError) {
      steps.push({ kind: 'error', content: inputError });
      messages.push({ role: 'assistant', content: output });
      messages.push({
        role: 'user',
        content: `Observation: Error - ${inputError}. Reply with a corrected Action or a Final Answer.`,
      });
      continue;
    }

    steps.push({
      kind: 'action',
      tool: fullName,
      input: toolInput,
      thought: parsed.thought,
    });
    let result: ToolResult;
    try {
      result = await deps.executeTool(fullName, toolInput);
    } catch (e) {
      result = { success: false, error: (e as Error).message || 'tool execution failed' };
    }
    steps.push({ kind: 'observation', tool: fullName, result });

    messages.push({ role: 'assistant', content: output });
    messages.push({
      role: 'user',
      content: `Observation: ${
        result.success
          ? truncate(JSON.stringify(result.output), maxObservationChars)
          : `Error - ${result.error}`
      }\n\nContinue. Reply with Thought/Action/Action Input, or Final Answer if you have enough information.`,
    });
  }

  if (stoppedReason !== 'completed' && iterations >= maxIterations) {
    steps.push({
      kind: 'error',
      content: `Reached maximum iterations (${maxIterations}) without a final answer`,
    });
  }

  if (lastAnswer === '') {
    const lastFinal = [...steps].reverse().find((step) => step.kind === 'final');
    lastAnswer = lastFinal ? (lastFinal as { answer: string }).answer : '';
  }

  return {
    success: stoppedReason === 'completed' && lastAnswer.length > 0,
    answer: lastAnswer,
    steps,
    iterations,
    stoppedReason,
  };
}

// ---------------------------------------------------------------------------
// Native function-calling agent — uses engine.generate() with `tools` so the
// model itself decides when to call tools (no Thought/Action text parsing).
// Falls back to runReActAgent when the engine reports supportsTools() === false.
// ---------------------------------------------------------------------------

export interface FunctionAgentDeps {
  engine: LLMEngine;
  options?: GenerateOptions;
  listTools: () => AgentToolInfo[];
  executeTool: (fullName: string, params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface FunctionAgentResult {
  success: boolean;
  answer: string;
  steps: AgentStep[];
  iterations: number;
  toolCalls: number;
  stoppedReason: 'completed' | 'max_iterations';
}

export async function runFunctionAgent(
  input: string,
  deps: FunctionAgentDeps,
  options: AgentOptions = {},
): Promise<FunctionAgentResult> {
  const maxIterations = Math.min(24, Math.max(1, options.maxIterations ?? DEFAULT_MAX_ITERATIONS));
  const maxObservationChars = options.maxObservationChars ?? DEFAULT_MAX_OBSERVATION_CHARS;
  const maxContextChars = options.maxContextChars ?? DEFAULT_MAX_CONTEXT_CHARS;

  const tools = deps.listTools();
  const specs = convertToFunctionSpecs(tools);
  const resolveTool = (name: string): string | null => {
    if (tools.some((t) => `${t.pluginId}:${t.tool.name}` === name)) return name;
    const byShortName = tools.filter((t) => t.tool.name === name);
    return byShortName.length === 1
      ? `${byShortName[0].pluginId}:${byShortName[0].tool.name}`
      : null;
  };

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        'You are ModelVerse Agent. You have function tools available — call them when facts are needed instead of guessing.',
        'Combine information from multiple tools when useful, then answer the user directly.',
      ].join('\n'),
    },
    { role: 'user', content: input },
  ];

  const steps: AgentStep[] = [];
  let iterations = 0;
  let toolCalls = 0;
  let stoppedReason: FunctionAgentResult['stoppedReason'] = 'max_iterations';
  let lastAnswer = '';

  while (iterations < maxIterations) {
    iterations++;
    if (totalContextChars(messages) > maxContextChars) {
      steps.push({
        kind: 'error',
        content: `Context budget exceeded (${maxContextChars} chars). Stopping.`,
      });
      break;
    }

    let text = '';
    let calls: EngineToolCall[];
    try {
      const result = await deps.engine.generate(messages, {
        ...(deps.options ?? {}),
        tools: specs,
      });
      for await (const token of result.stream) text += token;
      calls = result.toolCalls ?? [];
    } catch (e) {
      const message = (e as Error).message || 'generate failed';
      steps.push({ kind: 'error', content: `Generate failed: ${message}` });
      messages.push({
        role: 'user',
        content: `Observation: Error - generate failed (${message}). Answer directly if you can.`,
      });
      continue;
    }

    if (calls.length === 0) {
      lastAnswer = text.trim();
      if (lastAnswer) {
        steps.push({ kind: 'final', answer: lastAnswer });
        stoppedReason = 'completed';
      } else {
        steps.push({ kind: 'error', content: 'Empty response with no tool calls' });
      }
      break;
    }

    messages.push({
      role: 'assistant',
      content:
        text || calls.map((c) => `Call ${c.name}(${JSON.stringify(c.arguments)})`).join('\n'),
    });

    for (const call of calls) {
      toolCalls++;
      const fullName = resolveTool(call.name);
      if (!fullName) {
        const content = `Unknown tool "${call.name}". Available: ${tools.map((t) => `${t.pluginId}:${t.tool.name}`).join(', ')}`;
        steps.push({ kind: 'error', content });
        messages.push({ role: 'user', content: `Observation: Error - ${content}` });
        continue;
      }
      const inputError = validateAgentToolInput(tools, fullName, call.arguments);
      if (inputError) {
        steps.push({ kind: 'error', content: inputError });
        messages.push({
          role: 'user',
          content: `Observation: Error - ${inputError}. Proceed with what you have or answer directly.`,
        });
        continue;
      }
      steps.push({ kind: 'action', tool: fullName, input: call.arguments });
      let result: ToolResult;
      try {
        result = await deps.executeTool(fullName, call.arguments);
      } catch (e) {
        result = { success: false, error: (e as Error).message || 'tool execution failed' };
      }
      steps.push({ kind: 'observation', tool: fullName, result });
      messages.push({
        role: 'user',
        content: `Observation (${fullName}): ${
          result.success
            ? truncate(JSON.stringify(result.output), maxObservationChars)
            : `Error - ${result.error}`
        }`,
      });
    }
  }

  if (stoppedReason !== 'completed' && iterations >= maxIterations) {
    steps.push({
      kind: 'error',
      content: `Reached maximum iterations (${maxIterations}) without a final answer`,
    });
  }

  return {
    success: stoppedReason === 'completed' && lastAnswer.length > 0,
    answer: lastAnswer,
    steps,
    iterations,
    toolCalls,
    stoppedReason,
  };
}
