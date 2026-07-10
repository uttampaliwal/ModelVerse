"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMEngine = void 0;
class LLMEngine {
    config = {};
    _running = false;
    get running() {
        return this._running;
    }
}
exports.LLMEngine = LLMEngine;
