export const PLUGIN_API_VERSION = '0.1.0';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  description: string;
  author: string;
  icon?: string;
  category: PluginCategory;
  enabled: boolean;
  settings?: PluginSettingDefinition[];
  dependencies?: string[];
}

export type PluginCategory =
  'generation' | 'speech' | 'search' | 'rag' | 'code' | 'vision' | 'utility';

export interface PluginSettingDefinition {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  default: unknown;
  description?: string;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
}

export interface PluginContext {
  registerTool: (tool: ToolDefinition) => void;
  registerCommand: (command: CommandDefinition) => void;
  registerHook: (hook: HookDefinition) => void;
  getConfig: () => Record<string, unknown>;
  setConfig: (config: Record<string, unknown>) => void;
  log: (message: string) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required?: boolean;
    }
  >;
  execute: (params: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface CommandDefinition {
  name: string;
  description: string;
  usage?: string;
  execute: (args: string[]) => Promise<string>;
}

export interface HookDefinition {
  name: string;
  description: string;
  handler: (data: unknown) => Promise<unknown>;
}

export interface PluginInstance {
  manifest: PluginManifest;
  tools: ToolDefinition[];
  commands: CommandDefinition[];
  hooks: HookDefinition[];
  activate: (ctx: PluginContext) => Promise<void>;
  deactivate: () => Promise<void>;
}

export abstract class Plugin implements PluginInstance {
  manifest!: PluginManifest;
  tools: ToolDefinition[] = [];
  commands: CommandDefinition[] = [];
  hooks: HookDefinition[] = [];

  protected ctx!: PluginContext;

  abstract activate(ctx: PluginContext): Promise<void>;
  abstract deactivate(): Promise<void>;

  protected registerTool(tool: ToolDefinition): void {
    this.tools.push(tool);
    this.ctx.registerTool(tool);
  }

  protected registerCommand(command: CommandDefinition): void {
    this.commands.push(command);
    this.ctx.registerCommand(command);
  }

  protected registerHook(hook: HookDefinition): void {
    this.hooks.push(hook);
    this.ctx.registerHook(hook);
  }
}

export type PluginConstructor = new () => Plugin;
