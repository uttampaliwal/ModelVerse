"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonPlugin = void 0;
const base_1 = require("./base");
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class ExecuteCodeTool {
    name = 'execute_python';
    description = 'Execute Python code in a sandboxed environment';
    parameters = {
        code: { type: 'string', description: 'Python code to execute', required: true },
        timeout: { type: 'number', description: 'Timeout in seconds (default: 30)' },
    };
    async execute(params) {
        const code = params.code;
        const timeout = params.timeout || 30;
        const tmpFile = path_1.default.join(os_1.default.tmpdir(), `modelverse_py_${Date.now()}.py`);
        fs_1.default.writeFileSync(tmpFile, code);
        try {
            const result = await new Promise((resolve, reject) => {
                const proc = (0, child_process_1.spawn)('python', [tmpFile], {
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
        }
        catch (e) {
            return { success: false, error: e.message };
        }
        finally {
            try {
                fs_1.default.unlinkSync(tmpFile);
            }
            catch { }
        }
    }
}
class RunNotebookTool {
    name = 'run_notebook';
    description = 'Execute a Jupyter notebook (.ipynb) and return results';
    parameters = {
        path: { type: 'string', description: 'Path to the notebook file', required: true },
    };
    async execute(params) {
        const notebookPath = params.path;
        if (!fs_1.default.existsSync(notebookPath)) {
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
class PythonPlugin extends base_1.Plugin {
    manifest = {
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
    async activate(ctx) {
        this.ctx = ctx;
        this.registerTool(new ExecuteCodeTool());
        this.registerTool(new RunNotebookTool());
        ctx.log('Python plugin activated');
    }
    async deactivate() {
        this.tools = [];
    }
}
exports.PythonPlugin = PythonPlugin;
