import {
  Plugin,
  type PluginManifest,
  type PluginContext,
  type ToolDefinition,
  type ToolResult,
} from './base';

class TextToSpeechTool implements ToolDefinition {
  name = 'text_to_speech';
  description = 'Convert text to speech audio';
  parameters = {
    text: { type: 'string', description: 'Text to convert to speech', required: true },
    voice: { type: 'string', description: 'Voice to use (default: default)' },
    speed: { type: 'number', description: 'Speech speed multiplier (default: 1.0)' },
  };

  execute(params: Record<string, unknown>): Promise<ToolResult> {
    const text = params.text as string;
    return Promise.resolve({
      success: true,
      output: {
        format: 'audio',
        text,
        note: 'TTS requires piper, espeak, or OpenAI TTS API configured',
      },
    });
  }
}

class SpeechToTextTool implements ToolDefinition {
  name = 'speech_to_text';
  description = 'Transcribe speech audio to text using Whisper';
  parameters = {
    audio_path: {
      type: 'string',
      description: 'Path to audio file or base64 audio data',
      required: true,
    },
    language: { type: 'string', description: 'Language code (e.g., en, es, fr)' },
  };

  execute(params: Record<string, unknown>): Promise<ToolResult> {
    const audioPath = params.audio_path as string;
    return Promise.resolve({
      success: true,
      output: {
        format: 'text',
        audioPath,
        note: 'STT requires whisper.cpp or OpenAI Whisper API configured',
      },
    });
  }
}

export class SpeechPlugin extends Plugin {
  manifest: PluginManifest = {
    id: 'speech',
    name: 'Speech',
    version: '1.0.0',
    apiVersion: '^0.1.0',
    description:
      'Text-to-speech and speech-to-text capabilities using Whisper, Piper, or cloud APIs',
    author: 'ModelVerse',
    icon: 'mic',
    category: 'speech',
    enabled: false,
    settings: [
      {
        key: 'tts_provider',
        label: 'TTS Provider',
        type: 'select',
        default: 'piper',
        options: [
          { label: 'Piper (Local)', value: 'piper' },
          { label: 'OpenAI TTS', value: 'openai' },
          { label: 'eSpeak', value: 'espeak' },
        ],
      },
      {
        key: 'stt_provider',
        label: 'STT Provider',
        type: 'select',
        default: 'whisper',
        options: [
          { label: 'Whisper.cpp (Local)', value: 'whisper' },
          { label: 'OpenAI Whisper', value: 'openai' },
        ],
      },
      {
        key: 'whisper_path',
        label: 'Whisper Path',
        type: 'string',
        default: '',
        description: 'Path to whisper binary',
      },
      {
        key: 'piper_path',
        label: 'Piper Path',
        type: 'string',
        default: '',
        description: 'Path to piper binary',
      },
    ],
  };

  activate(ctx: PluginContext): Promise<void> {
    this.ctx = ctx;
    this.registerTool(new TextToSpeechTool());
    this.registerTool(new SpeechToTextTool());
    ctx.log('Speech plugin activated');
    return Promise.resolve();
  }

  deactivate(): Promise<void> {
    this.tools = [];
    return Promise.resolve();
  }
}
