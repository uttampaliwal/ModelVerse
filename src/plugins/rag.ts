import {
  Plugin,
  type PluginManifest,
  type PluginContext,
  type ToolDefinition,
  type ToolResult,
} from './base';
import fs from 'fs';
import path from 'path';
import { documentChunkArraySchema, loadAndValidate } from '../config-schemas';

interface DocumentChunk {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
}

class RAGStore {
  private chunks: DocumentChunk[] = [];
  private storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
    this.load();
  }

  private load(): void {
    this.chunks = loadAndValidate(documentChunkArraySchema, this.storePath, [], 'RAG');
  }

  private save(): void {
    try {
      fs.writeFileSync(this.storePath, JSON.stringify(this.chunks, null, 2));
    } catch {}
  }

  add(content: string, metadata: Record<string, unknown>): string {
    const id = `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.chunks.push({ id, content, metadata });
    this.save();
    return id;
  }

  search(query: string, topK: number = 5): DocumentChunk[] {
    const queryWords = query.toLowerCase().split(/\s+/);
    const scored = this.chunks.map((chunk) => {
      const contentLower = chunk.content.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (contentLower.includes(word)) score++;
      }
      return { chunk, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((s) => s.chunk);
  }

  list(): DocumentChunk[] {
    return [...this.chunks];
  }

  delete(id: string): boolean {
    const before = this.chunks.length;
    this.chunks = this.chunks.filter((c) => c.id !== id);
    if (this.chunks.length < before) {
      this.save();
      return true;
    }
    return false;
  }

  clear(): void {
    this.chunks = [];
    this.save();
  }
}

let store: RAGStore | null = null;

class IngestDocumentTool implements ToolDefinition {
  name = 'ingest_document';
  description = 'Ingest a document or text into the RAG knowledge base for retrieval';
  parameters = {
    content: { type: 'string', description: 'Text content to ingest', required: true },
    source: { type: 'string', description: 'Source filename or URL' },
    chunk_size: { type: 'number', description: 'Chunk size in characters (default: 1000)' },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!store) return { success: false, error: 'RAG store not initialized' };

    const content = params.content as string;
    const source = (params.source as string) || 'direct';
    const chunkSize = (params.chunk_size as number) || 1000;

    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.substring(i, i + chunkSize));
    }

    const ids = chunks.map((c) => store!.add(c, { source, ingestedAt: new Date().toISOString() }));

    return {
      success: true,
      output: { chunks_ingested: ids.length, source, total_documents: store.list().length },
    };
  }
}

class SearchKnowledgeTool implements ToolDefinition {
  name = 'search_knowledge';
  description = 'Search the RAG knowledge base for relevant information';
  parameters = {
    query: { type: 'string', description: 'Search query', required: true },
    top_k: { type: 'number', description: 'Number of results (default: 5)' },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!store) return { success: false, error: 'RAG store not initialized' };

    const query = params.query as string;
    const topK = (params.top_k as number) || 5;

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

class ListDocumentsTool implements ToolDefinition {
  name = 'list_documents';
  description = 'List all documents in the RAG knowledge base';
  parameters = {};

  async execute(): Promise<ToolResult> {
    if (!store) return { success: false, error: 'RAG store not initialized' };
    const docs = store.list();
    return { success: true, output: { count: docs.length, documents: docs } };
  }
}

export class RAGPlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'rag',
    name: 'RAG (Retrieval-Augmented Generation)',
    version: '1.0.0',
    apiVersion: '^0.1.0',
    description:
      'Build a knowledge base from documents and retrieve relevant context for conversations',
    author: 'ModelVerse',
    icon: 'database',
    category: 'rag',
    enabled: false,
    settings: [
      {
        key: 'store_path',
        label: 'Store Path',
        type: 'string',
        default: './rag-store.json',
        description: 'Path to store documents',
      },
      { key: 'chunk_size', label: 'Default Chunk Size', type: 'number', default: 1000 },
    ],
  };

  async activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const config = ctx.getConfig();
    const storePath = (config.store_path as string) || './rag-store.json';
    store = new RAGStore(path.resolve(storePath));
    this.registerTool(new IngestDocumentTool());
    this.registerTool(new SearchKnowledgeTool());
    this.registerTool(new ListDocumentsTool());
    ctx.log(`RAG plugin activated (store: ${storePath})`);
  }

  async deactivate(): Promise<void> {
    this.tools = [];
    store = null;
  }
}
