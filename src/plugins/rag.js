"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGPlugin = void 0;
const base_1 = require("./base");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_schemas_1 = require("../config-schemas");
class RAGStore {
    chunks = [];
    storePath;
    constructor(storePath) {
        this.storePath = storePath;
        this.load();
    }
    load() {
        this.chunks = (0, config_schemas_1.loadAndValidate)(config_schemas_1.documentChunkArraySchema, this.storePath, [], 'RAG');
    }
    save() {
        try {
            fs_1.default.writeFileSync(this.storePath, JSON.stringify(this.chunks, null, 2));
        }
        catch { }
    }
    add(content, metadata) {
        const id = `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.chunks.push({ id, content, metadata });
        this.save();
        return id;
    }
    search(query, topK = 5) {
        const queryWords = query.toLowerCase().split(/\s+/);
        const scored = this.chunks.map((chunk) => {
            const contentLower = chunk.content.toLowerCase();
            let score = 0;
            for (const word of queryWords) {
                if (contentLower.includes(word))
                    score++;
            }
            return { chunk, score };
        });
        return scored
            .filter((s) => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, topK)
            .map((s) => s.chunk);
    }
    list() {
        return [...this.chunks];
    }
    delete(id) {
        const before = this.chunks.length;
        this.chunks = this.chunks.filter((c) => c.id !== id);
        if (this.chunks.length < before) {
            this.save();
            return true;
        }
        return false;
    }
    clear() {
        this.chunks = [];
        this.save();
    }
}
let store = null;
class IngestDocumentTool {
    name = 'ingest_document';
    description = 'Ingest a document or text into the RAG knowledge base for retrieval';
    parameters = {
        content: { type: 'string', description: 'Text content to ingest', required: true },
        source: { type: 'string', description: 'Source filename or URL' },
        chunk_size: { type: 'number', description: 'Chunk size in characters (default: 1000)' },
    };
    async execute(params) {
        if (!store)
            return { success: false, error: 'RAG store not initialized' };
        const content = params.content;
        const source = params.source || 'direct';
        const chunkSize = params.chunk_size || 1000;
        const chunks = [];
        for (let i = 0; i < content.length; i += chunkSize) {
            chunks.push(content.substring(i, i + chunkSize));
        }
        const ids = chunks.map((c) => store.add(c, { source, ingestedAt: new Date().toISOString() }));
        return {
            success: true,
            output: { chunks_ingested: ids.length, source, total_documents: store.list().length },
        };
    }
}
class SearchKnowledgeTool {
    name = 'search_knowledge';
    description = 'Search the RAG knowledge base for relevant information';
    parameters = {
        query: { type: 'string', description: 'Search query', required: true },
        top_k: { type: 'number', description: 'Number of results (default: 5)' },
    };
    async execute(params) {
        if (!store)
            return { success: false, error: 'RAG store not initialized' };
        const query = params.query;
        const topK = params.top_k || 5;
        const results = store.search(query, topK);
        return {
            success: true,
            output: results.map((r) => ({
                id: r.id,
                content: r.content,
                metadata: r.metadata,
            })),
        };
    }
}
class ListDocumentsTool {
    name = 'list_documents';
    description = 'List all documents in the RAG knowledge base';
    parameters = {};
    async execute() {
        if (!store)
            return { success: false, error: 'RAG store not initialized' };
        const docs = store.list();
        return { success: true, output: { count: docs.length, documents: docs } };
    }
}
class RAGPlugin extends base_1.Plugin {
    manifest = {
        id: 'rag',
        name: 'RAG (Retrieval-Augmented Generation)',
        version: '1.0.0',
        description: 'Build a knowledge base from documents and retrieve relevant context for conversations',
        author: 'ModelVerse',
        icon: 'database',
        category: 'rag',
        enabled: false,
        settings: [
            { key: 'store_path', label: 'Store Path', type: 'string', default: './rag-store.json', description: 'Path to store documents' },
            { key: 'chunk_size', label: 'Default Chunk Size', type: 'number', default: 1000 },
        ],
    };
    async activate(ctx) {
        this.ctx = ctx;
        const config = ctx.getConfig();
        const storePath = config.store_path || './rag-store.json';
        store = new RAGStore(path_1.default.resolve(storePath));
        this.registerTool(new IngestDocumentTool());
        this.registerTool(new SearchKnowledgeTool());
        this.registerTool(new ListDocumentsTool());
        ctx.log(`RAG plugin activated (store: ${storePath})`);
    }
    async deactivate() {
        this.tools = [];
        store = null;
    }
}
exports.RAGPlugin = RAGPlugin;
