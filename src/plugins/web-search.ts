import {
  Plugin,
  type PluginManifest,
  type PluginContext,
  type ToolDefinition,
  type ToolResult,
} from './base';

class WebSearchTool implements ToolDefinition {
  name = 'web_search';
  description = 'Search the web for information using DuckDuckGo, Google, or Brave Search';
  parameters = {
    query: { type: 'string', description: 'Search query', required: true },
    num_results: { type: 'number', description: 'Number of results to return (default: 5)' },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const query = params.query as string;
    const numResults = (params.num_results as number) || 5;

    try {
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        AbstractText?: string;
        RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
      };

      const results: Array<{ title: string; url: string; snippet: string }> = [];

      if (data.AbstractText) {
        results.push({
          title: query,
          url: '',
          snippet: data.AbstractText,
        });
      }

      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, numResults)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
              url: topic.FirstURL,
              snippet: topic.Text,
            });
          }
        }
      }

      return { success: true, output: results };
    } catch (e) {
      return { success: false, error: `Search failed: ${(e as Error).message}` };
    }
  }
}

class FetchUrlTool implements ToolDefinition {
  name = 'fetch_url';
  description = 'Fetch and extract text content from a URL';
  parameters = {
    url: { type: 'string', description: 'URL to fetch', required: true },
    max_length: { type: 'number', description: 'Maximum characters to return (default: 5000)' },
  };

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string;
    const maxLength = (params.max_length as number) || 5000;

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ModelVerse/1.0' },
        signal: AbortSignal.timeout(10000),
      });
      const html = await res.text();

      // Simple HTML to text extraction
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, maxLength);

      return { success: true, output: { url, text, length: text.length } };
    } catch (e) {
      return { success: false, error: `Fetch failed: ${(e as Error).message}` };
    }
  }
}

export class WebSearchPlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'web-search',
    name: 'Web Search',
    version: '1.0.0',
    description: 'Search the web and fetch content from URLs for up-to-date information',
    author: 'ModelVerse',
    icon: 'search',
    category: 'search',
    enabled: false,
    settings: [
      {
        key: 'provider',
        label: 'Search Provider',
        type: 'select',
        default: 'duckduckgo',
        options: [
          { label: 'DuckDuckGo', value: 'duckduckgo' },
          { label: 'Brave Search', value: 'brave' },
          { label: 'Google Custom Search', value: 'google' },
        ],
      },
      {
        key: 'api_key',
        label: 'API Key',
        type: 'string',
        default: '',
        description: 'API key for Brave/Google (optional for DuckDuckGo)',
      },
    ],
  };

  async activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    this.registerTool(new WebSearchTool());
    this.registerTool(new FetchUrlTool());
    ctx.log('Web Search plugin activated');
  }

  async deactivate(): Promise<void> {
    this.tools = [];
  }
}
