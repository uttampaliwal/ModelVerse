import { describe, it, expect } from 'vitest';
import {
  serverSettingsSchema,
  activeProfileSchema,
  profileSchema,
  loadAndValidate,
} from '../src/config-schemas';

describe('serverSettingsSchema', () => {
  it('accepts valid settings with defaults', () => {
    const result = serverSettingsSchema.parse({ port: 8080 });
    expect(result.port).toBe(8080);
    expect(result.activeEngine).toBe('llamacpp');
  });

  it('rejects invalid activeEngine', () => {
    expect(() => serverSettingsSchema.parse({ activeEngine: 'invalid-engine' })).toThrow();
  });

  it('rejects port out of range', () => {
    expect(() => serverSettingsSchema.parse({ port: 99999 })).toThrow();
  });

  it('applies defaults', () => {
    const result = serverSettingsSchema.parse({});
    expect(result.port).toBe(3000);
    expect(result.activeEngine).toBe('llamacpp');
  });
});

describe('activeProfileSchema', () => {
  it('accepts valid active profile', () => {
    const result = activeProfileSchema.parse({ profile: 'MyProfile' });
    expect(result.profile).toBe('MyProfile');
  });

  it('applies default', () => {
    const result = activeProfileSchema.parse({});
    expect(result.profile).toBe('Balanced');
  });
});

describe('profileSchema', () => {
  it('accepts valid profile', () => {
    const data = {
      id: 'test',
      name: 'Test Profile',
      engineId: 'llama',
      modelId: 'test-model',
      systemPrompt: 'You are a test assistant.',
      temperature: 0.7,
      maxTokens: 2048,
    };
    const result = profileSchema.parse(data);
    expect(result.name).toBe('Test Profile');
    expect(result.temperature).toBe(0.7);
    expect(result.maxTokens).toBe(2048);
  });

  it('rejects temperature out of range', () => {
    expect(() => profileSchema.parse({ name: 'Test', temperature: 3 })).toThrow();
  });
});

describe('loadAndValidate', () => {
  it('returns defaults when file does not exist', () => {
    const result = loadAndValidate(serverSettingsSchema, '/nonexistent/path.json', {
      port: 8080,
    });
    expect(result.port).toBe(8080);
  });
});
