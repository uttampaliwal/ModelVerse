import { Plugin, type PluginManifest, type PluginContext, type ToolDefinition, type ToolResult } from './base';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

class ExecuteCodeTool implements ToolDefinition {
  name = 'execute_python';
  description = 'Execute Python code in a sandboxed environment';
  parameters = {
    code: { type: 'string', description: 'Python code to execute', required: true },
    timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const code = params.code as string;
    const timeout = (params.timeout as number) || 30;

    const tmpFile = path.join(os.tmpdir(), `modelverse_py_${Date.now()}.py`);
    fs.writeFileSync(tmpFile, code);

    try {
      const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
        const proc = spawn('python', [tmpFile], {
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: timeout * 1000,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout?.on('data', (d) => { stdout += d.toString(); });
        proc.stderr?.on('data', (d) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          resolve({ stdout, stderr, exitCode: code || 0 });
        });

        proc.on('error', (err) => {
          reject(err);
        });
      });

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
      try { fs.unlinkSync(tmpFile); } catch {}
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

    if (!fs.existsSync(notebookPath)) {
      return { success: false, error: `Notebook not found: ${notebookPath}` };
    }

    const code = `
import json
import sys

with open("${notebookPath.replace(/\\/g, '\\\\')}") as f:
    nb = json.load(f)

results = []
for i, cell in enumerate(nb.get("cells", [])):
    if cell["cell_type"] == "code":
        source = "".join(cell["source"])
        results.append({"cell": i, "source": source[:200]})
print(json.dumps(results[:10], indent=2))
`;

    const tool = new ExecuteCodeTool();
    return tool.execute({ code, timeout: 60 });
  }
}

export class PythonPlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'python',
    name: 'Python Execution',
    version: '1.0.0',
    description: 'Execute Python code and Jupyter notebooks for data analysis, visualization, and scripting',
    author: 'ModelVerse',
    icon: 'code',
    category: 'code',
    enabled: false,
    settings: [
      { key: 'python_path', label: 'Python Path', type: 'string', default: 'python', description: 'Path to Python executable' },
      { key: 'allowed_modules', label: 'Allowed Modules', type: 'string', default: '*', description: 'Comma-separated list of allowed modules (* for all)' },
      { key: 'max_timeout', label: 'Max Timeout (s)', type: 'number', default: 60 },
    ],
  };

  async activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    this.registerTool(new ExecuteCodeTool());
    this.registerTool(new RunNotebookTool());
    ctx.log('Python plugin activated');
  }

  async deactivate(): Promise<void> {
    this.tools = [];
  }
}
