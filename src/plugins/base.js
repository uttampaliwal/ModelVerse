"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Plugin = void 0;
class Plugin {
    manifest;
    tools = [];
    commands = [];
    hooks = [];
    ctx;
    registerTool(tool) {
        this.tools.push(tool);
        this.ctx.registerTool(tool);
    }
    registerCommand(command) {
        this.commands.push(command);
        this.ctx.registerCommand(command);
    }
    registerHook(hook) {
        this.hooks.push(hook);
        this.ctx.registerHook(hook);
    }
}
exports.Plugin = Plugin;
