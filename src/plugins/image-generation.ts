import {
  Plugin,
  type PluginManifest,
  type PluginContext,
  type ToolDefinition,
  type ToolResult,
} from './base';

class ImageGeneratorTool implements ToolDefinition {
  name = 'generate_image';
  description =
    'Generate an image from a text prompt using Stable Diffusion, DALL-E, or local models';
  parameters = {
    prompt: {
      type: 'string',
      description: 'Text description of the image to generate',
      required: true,
    },
    negative_prompt: { type: 'string', description: 'What to avoid in the image' },
    width: { type: 'number', description: 'Image width in pixels (default: 512)' },
    height: { type: 'number', description: 'Image height in pixels (default: 512)' },
    steps: { type: 'number', description: 'Number of inference steps (default: 30)' },
    seed: { type: 'number', description: 'Random seed for reproducibility' },
  };

  execute(params: Record<string, unknown>): Promise<ToolResult> {
    const prompt = params.prompt as string;
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return Promise.resolve({
        success: false,
        error: 'Missing required parameter: prompt (string)',
      });
    }
    // No image backend is configured in this build — fail honestly instead of
    // returning a placeholder so agents cannot mistake it for a real render.
    return Promise.resolve({
      success: false,
      error:
        'Image generation is not configured (not_configured). Configure a Stable Diffusion / DALL-E / ComfyUI provider to enable generate_image.',
    });
  }
}

export class ImageGenerationPlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'image-generation',
    name: 'Image Generation',
    version: '1.0.0',
    apiVersion: '^0.1.0',
    description:
      'Generate images from text prompts using Stable Diffusion, DALL-E, or local models',
    author: 'ModelVerse',
    icon: 'image',
    category: 'generation',
    enabled: false,
    settings: [
      {
        key: 'provider',
        label: 'Provider',
        type: 'select',
        default: 'local',
        options: [
          { label: 'Local (Stable Diffusion)', value: 'local' },
          { label: 'DALL-E', value: 'dalle' },
          { label: 'ComfyUI', value: 'comfyui' },
        ],
      },
      {
        key: 'model',
        label: 'Model Path',
        type: 'string',
        default: '',
        description: 'Path to local SD model or API endpoint',
      },
    ],
  };

  activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    this.registerTool(new ImageGeneratorTool());
    ctx.log('Image Generation plugin activated');
    return Promise.resolve();
  }

  deactivate(): Promise<void> {
    this.tools = [];
    return Promise.resolve();
  }
}
