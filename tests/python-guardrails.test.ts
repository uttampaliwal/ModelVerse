import { describe, it, expect } from 'vitest';
import { checkAllowedModules, clampTimeout, parsePythonImports } from '../src/plugins/python';

describe('parsePythonImports', () => {
  it('finds import and from-import top-level modules', () => {
    expect(parsePythonImports('import os, sys\nimport numpy as np\n')).toEqual(
      expect.arrayContaining(['os', 'sys', 'numpy']),
    );
    expect(parsePythonImports('from pathlib import Path\n')).toEqual(['pathlib']);
    expect(parsePythonImports('from .local import x\n')).toEqual([]);
    expect(parsePythonImports('x = 1  # import os\n')).toEqual([]);
    expect(parsePythonImports('import os.path\n')).toEqual(['os']);
  });
});

describe('checkAllowedModules', () => {
  it('allows everything on wildcard', () => {
    expect(checkAllowedModules('import os, socket', '*')).toBeNull();
    expect(checkAllowedModules('import os', '')).toBeNull();
  });

  it('blocks modules outside the allowlist', () => {
    expect(checkAllowedModules('import json', 'json, math')).toBeNull();
    expect(checkAllowedModules('import os', 'json, math')).toMatch(/"os"/);
    expect(checkAllowedModules('from socket import create_connection', 'json')).toMatch(/"socket"/);
  });
});

describe('clampTimeout', () => {
  it('clamps client timeouts to the configured maximum', () => {
    expect(clampTimeout(30, 60)).toBe(30);
    expect(clampTimeout(9999, 60)).toBe(60);
    expect(clampTimeout(9999, 500)).toBe(120); // hard cap wins
    expect(clampTimeout(0, 60)).toBe(1);
    expect(clampTimeout('junk', 60)).toBe(30);
    expect(clampTimeout(undefined, 10)).toBe(10);
  });
});
