"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.log = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const LOG_DIR = path_1.default.join(__dirname, '..', 'logs');
if (!fs_1.default.existsSync(LOG_DIR)) {
    fs_1.default.mkdirSync(LOG_DIR, { recursive: true });
}
function write(file, msg) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    fs_1.default.appendFileSync(path_1.default.join(LOG_DIR, file), `[${ts}] ${msg}\n`);
}
exports.log = {
    server(msg) {
        const line = `[SERVER] ${msg}`;
        console.log(line);
        write('server.log', line);
    },
    engine(msg) {
        const line = `[ENGINE] ${msg}`;
        console.log(line);
        write('engine.log', line);
    },
    error(msg, err) {
        const stack = err?.stack ? `\n${err.stack}` : '';
        const line = `[ERROR] ${msg}${stack}`;
        console.error(line);
        write('errors.log', line);
    },
};
