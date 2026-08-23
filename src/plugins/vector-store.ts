import {
  Plugin,
  type PluginManifest,
  type PluginContext,
  type ToolDefinition,
  type ToolResult,
} from './base';
import path from 'path';
import { VectorStore, type SearchMode } from '../vector-store';
import { createEmbeddingProvider } from '../embeddings';

let store: VectorStore | null = null;

class VectorUpsertTool implements ToolDefinition {
  name = 'vector_upsert';
  description =
    'Add or update a text record in the vector store. Long texts are chunked with overlap and each chunk is embedded for semantic search';
  parameters = {
    text: { type: 'string', description: 'Text content to embed and store', required: true },
    id: {
      type: 'string',
      description: 'Optional record id. Providing it replaces an existing record family',
    },
    metadata: { type: 'string', description: 'Optional JSON string with record metadata' },
    chunk_size: { type: 'number', description: 'Chunk size in characters (default: 1000)' },
  };

  execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!store) return Promise.resolve({ success: false, error: 'Vector store not initialized' });

    const text = params.text as string;
    if (!text)
      return Promise.resolve({ success: false, error: 'Missing required parameter: text' });

    let metadata: Record<string, unknown> = {};
    if (params.metadata) {
      try {
        metadata = JSON.parse(params.metadata as string) as Record<string, unknown>;
      } catch {
        return Promise.resolve({ success: false, error: 'metadata must be a valid JSON string' });
      }
    }

    const chunkSize = (params.chunk_size as number) || undefined;
    return store
      .upsert(text, metadata, params.id as string | undefined, chunkSize)
      .then((ids) => ({
        success: true,
        output: {
          ids,
          chunks_upserted: ids.length,
          total_records: store!.size,
          provider: store!.providerName,
        },
      }))
      .catch((e: Error) => ({ success: false, error: e.message }));
  }
}

class VectorSearchTool implements ToolDefinition {
  name = 'vector_search';
  description =
    'Search the vector store. Modes: semantic (embedding cosine), keyword (exact term match), hybrid (Reciprocal Rank Fusion of both)';
  parameters = {
    query: { type: 'string', description: 'Query text to search for', required: true },
    top_k: { type: 'number', description: 'Number of results (default: 5)' },
    mode: {
      type: 'string',
      description: "Retrieval mode: 'semantic', 'keyword', or 'hybrid' (default)",
    },
  };

  execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!store) return Promise.resolve({ success: false, error: 'Vector store not initialized' });

    const query = params.query as string;
    if (!query)
      return Promise.resolve({ success: false, error: 'Missing required parameter: query' });

    const topK = (params.top_k as number) || 5;
    const modeParam = params.mode as SearchMode | undefined;
    const mode: SearchMode =
      modeParam === 'semantic' || modeParam === 'keyword' || modeParam === 'hybrid'
        ? modeParam
        : 'hybrid';

    return store
      .search(query, topK, mode)
      .then((hits) => ({
        success: true,
        output: hits.map((hit) => ({
          id: hit.record.id,
          score: Number(hit.score.toFixed(4)),
          text: hit.record.text,
          metadata: hit.record.metadata,
        })),
      }))
      .catch((e: Error) => ({ success: false, error: e.message }));
  }
}

class VectorDeleteTool implements ToolDefinition {
  name = 'vector_delete';
  description = 'Delete a record from the vector store by id (including its chunk children)';
  parameters = {
    id: { type: 'string', description: 'Record id to delete', required: true },
  };

  execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!store) return Promise.resolve({ success: false, error: 'Vector store not initialized' });

    const id = params.id as string;
    const deleted = store.delete(id);
    return deleted
      ? Promise.resolve({ success: true, output: { id, deleted: true } })
      : Promise.resolve({ success: false, error: `Record not found: ${id}` });
  }
}

class VectorClearTool implements ToolDefinition {
  name = 'vector_clear';
  description = 'Delete all records from the vector store';
  parameters = {};

  execute(): Promise<ToolResult> {
    if (!store) return Promise.resolve({ success: false, error: 'Vector store not initialized' });
    const count = store.size;
    store.clear();
    return Promise.resolve({ success: true, output: { deleted: count } });
  }
}

class VectorStatsTool implements ToolDefinition {
  name = 'vector_stats';
  description = 'Get statistics about the vector store';
  parameters = {};

  execute(): Promise<ToolResult> {
    if (!store) return Promise.resolve({ success: false, error: 'Vector store not initialized' });
    return Promise.resolve({
      success: true,
      output: { ...store.stats(), records: store.list() },
    });
  }
}

export class VectorStorePlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'vector-store',
    name: 'Vector Store',
    version: '1.1.0',
    apiVersion: '^0.1.0',
    description:
      'Persistent embedding vector store with hybrid semantic retrieval: local MiniLM ONNX embeddings, keyword matching, and Reciprocal Rank Fusion',
    author: 'ModelVerse',
    icon: 'layers',
    category: 'rag',
    enabled: false,
    settings: [
      {
        key: 'store_path',
        label: 'Store Path',
        type: 'string',
        default: './vector-store.json',
        description: 'Path to persist vectors',
      },
      {
        key: 'embedding_provider',
        label: 'Embedding Provider',
        type: 'select',
        default: 'minilm',
        description:
          'minilm runs all-MiniLM-L6-v2 locally via ONNX (downloads ~25MB on first use, then offline). hash is a zero-dependency fallback',
        options: [
          { label: 'MiniLM (all-MiniLM-L6-v2)', value: 'minilm' },
          { label: 'Hashed bag-of-words (fallback)', value: 'hash' },
        ],
      },
      {
        key: 'dimension',
        label: 'Hash Embedding Dimension',
        type: 'number',
        default: 256,
        description: 'Dimensionality used by the hash fallback provider only',
      },
    ],
  };

  activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const config = ctx.getConfig();
    const storePath = (config.store_path as string) || './vector-store.json';
    const providerId = (config.embedding_provider as string) || 'minilm';
    const hashDimension = (config.dimension as number) || 256;
    const provider = createEmbeddingProvider(providerId, hashDimension);
    store = new VectorStore(path.resolve(storePath), provider);
    this.registerTool(new VectorUpsertTool());
    this.registerTool(new VectorSearchTool());
    this.registerTool(new VectorDeleteTool());
    this.registerTool(new VectorClearTool());
    this.registerTool(new VectorStatsTool());
    ctx.log(
      `Vector Store plugin activated (store: ${storePath}, provider: ${provider.name}, dim: ${provider.dimension})`,
    );
    return Promise.resolve();
  }

  deactivate(): Promise<void> {
    this.tools = [];
    store = null;
    return Promise.resolve();
  }
}
