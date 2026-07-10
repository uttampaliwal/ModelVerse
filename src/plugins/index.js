"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.plugins = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SETTINGS_FILE = path_1.default.join(process.cwd(), 'plugins.json');
function loadPluginSettings() {
    try {
        if (fs_1.default.existsSync(SETTINGS_FILE)) {
            return JSON.parse(fs_1.default.readFileSync(SETTINGS_FILE, 'utf-8'));
        }
    }
    catch { }
    return {};
}
function savePluginSettings(settings) {
    try {
        fs_1.default.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    }
    catch (e) {
        console.error('[PluginManager] Failed to save settings:', e.message);
    }
}
class PluginManager {
    plugins = new Map();
    registry = new Map();
    settings = loadPluginSettings();
    tools = new Map();
    commands = new Map();
    hooks = new Map();
    register(type) {
        const instance = new type();
        this.registry.set(instance.manifest.id, type);
    }
    async activate(pluginId) {
        if (this.plugins.has(pluginId))
            return;
        const Type = this.registry.get(pluginId);
        if (!Type)
            throw new Error(`Plugin not found: ${pluginId}`);
        const instance = new Type();
        const entry = {
            manifest: { ...instance.manifest, enabled: true },
            instance,
            tools: [],
            commands: [],
            hooks: [],
        };
        const config = this.settings[pluginId]?.config || {};
        this.settings[pluginId] = { enabled: true, config };
        savePluginSettings(this.settings);
        const ctx = {
            registerTool: (tool) => {
                entry.tools.push(tool);
                this.tools.set(`${pluginId}:${tool.name}`, tool);
            },
            registerCommand: (cmd) => {
                entry.commands.push(cmd);
                this.commands.set(`${pluginId}:${cmd.name}`, cmd);
            },
            registerHook: (hook) => {
                entry.hooks.push(hook);
                const existing = this.hooks.get(hook.name) || [];
                existing.push(hook);
                this.hooks.set(hook.name, existing);
            },
            getConfig: () => config,
            setConfig: (newConfig) => {
                this.settings[pluginId].config = { ...config, ...newConfig };
                savePluginSettings(this.settings);
            },
            log: (msg) => console.log(`[${instance.manifest.name}] ${msg}`),
        };
        await instance.activate(ctx);
        this.plugins.set(pluginId, entry);
        console.log(`[PluginManager] Activated: ${instance.manifest.name}`);
    }
    async deactivate(pluginId) {
        const entry = this.plugins.get(pluginId);
        if (!entry)
            return;
        await entry.instance.deactivate();
        for (const tool of entry.tools) {
            this.tools.delete(`${pluginId}:${tool.name}`);
        }
        for (const cmd of entry.commands) {
            this.commands.delete(`${pluginId}:${cmd.name}`);
        }
        for (const hook of entry.hooks) {
            const list = this.hooks.get(hook.name) || [];
            this.hooks.set(hook.name, list.filter((h) => h !== hook));
        }
        this.settings[pluginId] = { enabled: false, config: this.settings[pluginId]?.config || {} };
        savePluginSettings(this.settings);
        this.plugins.delete(pluginId);
        console.log(`[PluginManager] Deactivated: ${entry.manifest.name}`);
    }
    async toggle(pluginId) {
        if (this.plugins.has(pluginId)) {
            await this.deactivate(pluginId);
            return false;
        }
        else {
            await this.activate(pluginId);
            return true;
        }
    }
    async activateAll() {
        for (const [id, settings] of Object.entries(this.settings)) {
            if (settings.enabled && this.registry.has(id)) {
                try {
                    await this.activate(id);
                }
                catch (e) {
                    console.error(`[PluginManager] Failed to activate ${id}:`, e.message);
                }
            }
        }
    }
    getTool(fullName) {
        return this.tools.get(fullName);
    }
    getAllTools() {
        const result = [];
        for (const [key, tool] of this.tools) {
            const [pluginId] = key.split(':');
            result.push({ pluginId, tool });
        }
        return result;
    }
    async executeTool(fullName, params) {
        const tool = this.tools.get(fullName);
        if (!tool)
            return { success: false, error: `Tool not found: ${fullName}` };
        try {
            return await tool.execute(params);
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
    getCommand(fullName) {
        return this.commands.get(fullName);
    }
    async executeHook(name, data) {
        const hookList = this.hooks.get(name) || [];
        let result = data;
        for (const hook of hookList) {
            result = await hook.handler(result);
        }
        return result;
    }
    listAvailable() {
        const result = [];
        for (const [id, Type] of this.registry) {
            const instance = new Type();
            const active = this.plugins.has(id);
            result.push({ manifest: { ...instance.manifest, enabled: active }, active });
        }
        return result;
    }
    listActive() {
        return Array.from(this.plugins.values()).map((e) => e.manifest);
    }
}
exports.plugins = new PluginManager();
