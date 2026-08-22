import {
  Plugin,
  type PluginManifest,
  type PluginContext,
  type ToolDefinition,
  type ToolResult,
} from './base';
import path from 'path';
import { VectorStore } from '../vector-store';

let store: VectorStore | null = null;

class VectorUpsertTool implements ToolDefinition {
  name = 'vector_upsert';
  description =
    'Add or update a text record in the vector store. Text is embedded and searchable via semantic similarity';
  parameters = {
    text: { type: 'string', description: 'Text content to embed and store', required: true },
    id: {
      type: 'string',
      description: 'Optional record id. Providing it updates an existing record',
    },
    metadata: { type: 'string', description: 'Optional JSON string with record metadata' },
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

    const id = store.upsert(text, metadata, params.id as string | undefined);
    return Promise.resolve({
      success: true,
      output: { id, updated: Boolean(params.id), total_records: store.size },
    });
  }
}

class VectorSearchTool implements ToolDefinition {
  name = 'vector_search';
  description = 'Semantic similarity search over the vector store';
  parameters = {
    query: { type: 'string', description: 'Query text to search for', required: true },
    top_k: { type: 'number', description: 'Number of results (default: 5)' },
  };

  execute(params: Record<string, unknown>): Promise<ToolResult> {
    if (!store) return Promise.resolve({ success: false, error: 'Vector store not initialized' });

    const query = params.query as string;
    if (!query)
      return Promise.resolve({ success: false, error: 'Missing required parameter: query' });

    const topK = (params.top_k as number) || 5;
    const hits = store.search(query, topK);
    return Promise.resolve({
      success: true,
      output: hits.map((hit) => ({
        id: hit.record.id,
        score: Number(hit.score.toFixed(4)),
        text: hit.record.text,
        metadata: hit.record.metadata,
      })),
    });
  }
}

class VectorDeleteTool implements ToolDefinition {
  name = 'vector_delete';
  description = 'Delete a record from the vector store by id';
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
    version: '1.0.0',
    apiVersion: '^0.1.0',
    description:
      'Persistent embedding-based vector store with semantic similarity search over stored texts',
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
        key: 'dimension',
        label: 'Embedding Dimension',
        type: 'number',
        default: 256,
        description: 'Dimensionality of stored embeddings',
      },
    ],
  };

  activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    const config = ctx.getConfig();
    const storePath = (config.store_path as string) || './vector-store.json';
    const dimension = (config.dimension as number) || 256;
    store = new VectorStore(path.resolve(storePath), dimension);
    this.registerTool(new VectorUpsertTool());
    this.registerTool(new VectorSearchTool());
    this.registerTool(new VectorDeleteTool());
    this.registerTool(new VectorClearTool());
    this.registerTool(new VectorStatsTool());
    ctx.log(`Vector Store plugin activated (store: ${storePath}, dim: ${dimension})`);
    return Promise.resolve();
  }

  deactivate(): Promise<void> {
    this.tools = [];
    store = null;
    return Promise.resolve();
  }
}
