import { describe, it, expect } from 'vitest';
import path from 'path';
import { buildDownloadUrl, resolveDestPath, validateDownloadRequest } from '../src/model-download';

describe('validateDownloadRequest', () => {
  it('accepts a well-formed GGUF request', () => {
    expect(
      validateDownloadRequest({
        repo: 'bartowski/Meta-Llama-3.1-8B-GGUF',
        file: 'model-Q4_K_M.gguf',
      }),
    ).toBeNull();
  });

  it('rejects malformed repos', () => {
    expect(validateDownloadRequest({ repo: 'justaname', file: 'm.gguf' })).toMatch(/repo/);
    expect(validateDownloadRequest({ repo: '../../etc', file: 'm.gguf' })).toMatch(/repo/);
    expect(validateDownloadRequest({ repo: '', file: 'm.gguf' })).toMatch(/repo/);
  });

  it('rejects path traversal and bad extensions', () => {
    expect(validateDownloadRequest({ repo: 'o/m', file: '../evil.gguf' })).toMatch(/\.\./);
    expect(validateDownloadRequest({ repo: 'o/m', file: 'model.exe' })).toMatch(/gguf/);
    expect(validateDownloadRequest({ repo: 'o/m', file: 'm.gguf', filename: '../x.gguf' })).toMatch(
      /filename/,
    );
  });
});

describe('buildDownloadUrl', () => {
  it('points at the Hugging Face resolve endpoint', () => {
    expect(buildDownloadUrl({ repo: 'o/m', file: 'q/model.gguf' })).toBe(
      'https://huggingface.co/o/m/resolve/main/q/model.gguf',
    );
  });
});

describe('resolveDestPath', () => {
  it('jails output inside the models directory', () => {
    const dir = path.join('tmp', 'models');
    const dest = resolveDestPath({ repo: 'o/m', file: 'sub/model.gguf' }, dir);
    expect(dest).toBe(path.resolve(dir, 'model.gguf'));
    expect(() =>
      resolveDestPath({ repo: 'o/m', file: 'm.gguf', filename: 'ok.gguf' }, dir),
    ).not.toThrow();
  });
});
