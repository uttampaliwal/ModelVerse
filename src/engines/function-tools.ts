import type { AgentToolInfo } from '../agent/react-agent';
import type { EngineToolCall, FunctionToolSpec } from './base';
import { toGenerator } from './stream-utils';

/** Convert plugin tool definitions to OpenAI-compatible function specs. */
export function toFunctionToolSpecs(tools: AgentToolInfo[]): FunctionToolSpec[] {
  return tools.map(({ tool }) => {
    const properties: FunctionToolSpec['parameters']['properties'] = {};
    const required: string[] = [];
    for (const [name, schema] of Object.entries(tool.parameters ?? {})) {
      const type =
        schema.type === 'number' || schema.type === 'string' || schema.type === 'boolean'
          ? schema.type
          : 'string';
      properties[name] = { type, description: schema.description };
      if (schema.required) required.push(name);
    }
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object' as const,
        properties,
        ...(required.length > 0 ? { required } : {}),
      },
    };
  });
}

/** Build the OpenAI `tools` request field from internal specs. */
export function toOpenAITools(specs: FunctionToolSpec[]): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: unknown };
}> {
  return specs.map((s) => ({
    type: 'function' as const,
    function: { name: s.name, description: s.description, parameters: s.parameters },
  }));
}

interface OpenAIToolCallWire {
  id?: string;
  function?: { name?: string; arguments?: string };
}

function parseArgumentsJson(raw: string | undefined, toolName: string): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* fall through */
  }
  return { input: raw, _parseError: `arguments for ${toolName} were not valid JSON` };
}

export function parseOpenAIToolCalls(calls: OpenAIToolCallWire[] | undefined): EngineToolCall[] {
  if (!calls || calls.length === 0) return [];
  const result: EngineToolCall[] = [];
  for (const call of calls) {
    const name = call.function?.name;
    if (!name) continue;
    result.push({
      id: call.id,
      name,
      arguments: parseArgumentsJson(call.function?.arguments, name),
    });
  }
  return result;
}

interface OllamaToolCallWire {
  function?: { name?: string; arguments?: Record<string, unknown> | string };
}

export function parseOllamaToolCalls(calls: OllamaToolCallWire[] | undefined): EngineToolCall[] {
  if (!calls || calls.length === 0) return [];
  const result: EngineToolCall[] = [];
  for (const call of calls) {
    const name = call.function?.name;
    if (!name) continue;
    const args = call.function?.arguments;
    result.push({
      name,
      arguments:
        args && typeof args === 'object'
          ? args
          : parseArgumentsJson(typeof args === 'string' ? args : undefined, name),
    });
  }
  return result;
}

/** Build a GenerateResult for tools-mode: text streams, toolCalls ride along. */
export function toolsResult(
  content: string,
  toolCalls: EngineToolCall[],
): {
  stream: AsyncGenerator<string>;
  toolCalls: EngineToolCall[];
} {
  return { stream: toGenerator(content), toolCalls };
}
