import {
  Plugin,
  type PluginManifest,
  type PluginContext,
  type ToolDefinition,
  type ToolResult,
} from './base';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

export interface PythonGuardrails {
  pythonPath: string;
  allowedModules: string; // '*' or comma-separated top-level module names
  maxTimeout: number; // seconds
}

const DEFAULT_GUARDRAILS: PythonGuardrails = {
  pythonPath: 'python',
  allowedModules: '*',
  maxTimeout: 60,
};

const HARD_TIMEOUT_CAP = 120;
const MAX_OUTPUT_CHARS = 100000;

let activeGuardrails: PythonGuardrails = { ...DEFAULT_GUARDRAILS };

/** Extract top-level imported module names (static scan; best-effort). */
export function parsePythonImports(code: string): string[] {
  const modules = new Set<string>();
  for (const rawLine of code.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const importMatch = /^import\s+(.+)$/.exec(line);
    if (importMatch) {
      for (const part of importMatch[1].split(',')) {
        const name = part
          .trim()
          .split(/\s+as\s+/)[0]
          .trim()
          .split('.')[0];
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) modules.add(name);
      }
      continue;
    }
    const fromMatch = /^from\s+([A-Za-z_][A-Za-z0-9_.]*)\s+import\s+/.exec(line);
    if (fromMatch && !fromMatch[1].startsWith('.')) {
      modules.add(fromMatch[1].split('.')[0]);
    }
  }
  return [...modules];
}

/**
 * Enforce the module allowlist. Returns an error message or null when OK.
 * This is a guardrail, not a sandbox: dynamic imports (__import__, importlib
 * with computed names) can evade static scanning. Do not expose the Python
 * plugin on untrusted networks.
 */
export function checkAllowedModules(code: string, allowedRaw: string): string | null {
  const allowed = allowedRaw.trim();
  if (allowed === '' || allowed === '*') return null;
  const allowedSet = new Set(
    allowed
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0),
  );
  // The harness itself needs json/sys for notebook inspection; the tool's own
  // wrapper code is trusted, user code is what gets scanned.
  for (const mod of parsePythonImports(code)) {
    if (!allowedSet.has(mod)) {
      return `Module "${mod}" is not in allowed_modules (${allowedRaw})`;
    }
  }
  return null;
}

export function clampTimeout(requested: unknown, maxTimeout: number): number {
  const fallback = Math.min(30, maxTimeout);
  const n = Number(requested);
  const sane = Number.isFinite(n) ? Math.floor(n) : fallback;
  return Math.min(Math.max(1, sane), Math.min(maxTimeout, HARD_TIMEOUT_CAP));
}

class ExecuteCodeTool implements ToolDefinition {
  name = 'execute_python';
  description =
    'Execute Python code in a guardrailed subprocess: module allowlist, clamped timeouts, and capped output. Not a security sandbox — do not expose on untrusted networks';
  parameters = {
    code: { type: 'string', description: 'Python code to execute', required: true },
    timeout: { type: 'number', description: 'Timeout in seconds (clamped to max_timeout)' },
  };

  async execute(params: Record<string, unknown>, stdinData?: string): Promise<ToolResult> {
    const code = params.code as string;
    if (typeof code !== 'string' || !code.trim()) {
      return { success: false, error: 'Missing required parameter: code (string)' };
    }
    const guardrails = activeGuardrails;
    const blocked = checkAllowedModules(code, guardrails.allowedModules);
    if (blocked) return { success: false, error: blocked };
    const timeout = clampTimeout(params.timeout ?? 30, guardrails.maxTimeout);
    const pythonPath =
      typeof guardrails.pythonPath === 'string' && guardrails.pythonPath.trim()
        ? guardrails.pythonPath.trim()
        : 'python';

    const tmpFile = path.join(os.tmpdir(), `modelverse_py_${Date.now()}_${process.pid}.py`);
    fs.writeFileSync(tmpFile, code);

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
        (resolve, reject) => {
          const proc = spawn(pythonPath, [tmpFile], {
            stdio: [stdinData ? 'pipe' : 'ignore', 'pipe', 'pipe'],
          });

          let stdout = '';
          let stderr = '';
          let truncated = false;
          let timedOut = false;
          const timer = setTimeout(() => {
            timedOut = true;
            try {
              proc.kill('SIGKILL');
            } catch {
              /* ignore: process may already be gone */
            }
          }, timeout * 1000);

          const append = (target: 'out' | 'err', chunk: string): void => {
            const current = target === 'out' ? stdout : stderr;
            if (current.length >= MAX_OUTPUT_CHARS) {
              if (!truncated) {
                truncated = true;
                try {
                  proc.kill('SIGKILL');
                } catch {
                  /* ignore */
                }
              }
              return;
            }
            const next = (current + chunk).slice(0, MAX_OUTPUT_CHARS);
            if (target === 'out') stdout = next;
            else stderr = next;
          };

          if (stdinData) {
            proc.stdin?.write(stdinData);
            proc.stdin?.end();
          }

          proc.stdout?.on('data', (d) => {
            append('out', d.toString());
          });
          proc.stderr?.on('data', (d) => {
            append('err', d.toString());
          });

          proc.on('close', (code) => {
            clearTimeout(timer);
            if (timedOut) {
              resolve({ stdout, stderr, exitCode: 124 });
              return;
            }
            resolve({
              stdout: truncated ? stdout + '\n... (output truncated)' : stdout,
              stderr,
              exitCode: code ?? 1,
            });
          });

          proc.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
          });
        },
      );

      if (result.exitCode === 124) {
        return { success: false, error: `Timed out after ${timeout}s` };
      }
      return {
        success: result.exitCode === 0,
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
        },
        error: result.exitCode !== 0 ? result.stderr || `Exit code: ${result.exitCode}` : undefined,
      };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore: temp file cleanup is best-effort */
      }
    }
  }
}

class RunNotebookTool implements ToolDefinition {
  name = 'run_notebook';
  description = 'Execute a Jupyter notebook (.ipynb) and return results';
  parameters = {
    path: { type: 'string', description: 'Path to the notebook file', required: true },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const notebookPath = params.path as string;
    if (typeof notebookPath !== 'string' || !notebookPath.trim()) {
      return { success: false, error: 'Missing required parameter: path (string)' };
    }
    if (!notebookPath.toLowerCase().endsWith('.ipynb')) {
      return { success: false, error: 'Only .ipynb notebooks are accepted' };
    }

    if (!fs.existsSync(notebookPath)) {
      return { success: false, error: `Notebook not found: ${notebookPath}` };
    }

    let notebookContent: string;
    try {
      notebookContent = fs.readFileSync(notebookPath, 'utf-8');
    } catch {
      return { success: false, error: `Cannot read notebook: ${notebookPath}` };
    }

    // Pass notebook data via stdin instead of string interpolation
    const code = `
import json
import sys

nb = json.loads(sys.stdin.read())
results = []
for i, cell in enumerate(nb.get("cells", [])):
    if cell["cell_type"] == "code":
        source = "".join(cell["source"])
        results.append({"cell": i, "source": source[:200]})
print(json.dumps(results[:10], indent=2))
`;

    const tool = new ExecuteCodeTool();
    return tool.execute({ code, timeout: 60 }, notebookContent);
  }
}

export class PythonPlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'python',
    name: 'Python Execution',
    version: '1.0.0',
    apiVersion: '^0.1.0',
    description:
      'Execute Python code and Jupyter notebooks for data analysis, visualization, and scripting',
    author: 'ModelVerse',
    icon: 'code',
    category: 'code',
    enabled: false,
    settings: [
      {
        key: 'python_path',
        label: 'Python Path',
        type: 'string',
        default: 'python',
        description: 'Path to Python executable',
      },
      {
        key: 'allowed_modules',
        label: 'Allowed Modules',
        type: 'string',
        default: '*',
        description: 'Comma-separated list of allowed modules (* for all)',
      },
      { key: 'max_timeout', label: 'Max Timeout (s)', type: 'number', default: 60 },
    ],
  };

  activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const config = ctx.getConfig();
    activeGuardrails = {
      pythonPath:
        typeof config.python_path === 'string' && config.python_path.trim()
          ? config.python_path.trim()
          : DEFAULT_GUARDRAILS.pythonPath,
      allowedModules:
        typeof config.allowed_modules === 'string'
          ? config.allowed_modules
          : DEFAULT_GUARDRAILS.allowedModules,
      maxTimeout:
        typeof config.max_timeout === 'number' && Number.isFinite(config.max_timeout)
          ? Math.min(Math.max(1, Math.floor(config.max_timeout)), HARD_TIMEOUT_CAP)
          : DEFAULT_GUARDRAILS.maxTimeout,
    };
    this.registerTool(new ExecuteCodeTool());
    this.registerTool(new RunNotebookTool());
    ctx.log(
      `Python plugin activated (python: ${activeGuardrails.pythonPath}, max_timeout: ${activeGuardrails.maxTimeout}s)`,
    );
    return Promise.resolve();
  }

  deactivate(): Promise<void> {
    this.tools = [];
    activeGuardrails = { ...DEFAULT_GUARDRAILS };
    return Promise.resolve();
  }
}
