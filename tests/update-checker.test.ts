import { describe, it, expect, vi, afterEach } from 'vitest';
import { clearUpdateCache, getUpdateInfo, isNewerVersion } from '../src/update-checker';

afterEach(() => {
  clearUpdateCache();
  vi.unstubAllGlobals();
});

describe('isNewerVersion', () => {
  it('compares semver triples', () => {
    expect(isNewerVersion('0.0.2', '0.0.3')).toBe(true);
    expect(isNewerVersion('0.0.2', '0.1.0')).toBe(true);
    expect(isNewerVersion('0.0.2', '1.0.0')).toBe(true);
    expect(isNewerVersion('0.0.2', '0.0.2')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.0.9')).toBe(false);
  });

  it('tolerates a leading v and rejects garbage', () => {
    expect(isNewerVersion('0.0.2', 'v0.0.3')).toBe(true);
    expect(isNewerVersion('0.0.2', 'not-a-version')).toBe(false);
    expect(isNewerVersion('garbage', '1.0.0')).toBe(false);
  });
});

describe('getUpdateInfo', () => {
  it('reports an available update from the releases API', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ tag_name: 'v9.9.9' }),
      })),
    );
    const info = await getUpdateInfo('0.0.2');
    expect(info).toMatchObject({ current: '0.0.2', latest: '9.9.9', updateAvailable: true });
  });

  it('caches the second call without refetching', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v9.9.9' }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await getUpdateInfo('0.0.2');
    await getUpdateInfo('0.0.2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never throws on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    const info = await getUpdateInfo('0.0.2');
    expect(info).toMatchObject({ latest: null, updateAvailable: false });
    expect(info.error).toContain('offline');
  });

  it('handles repos with no releases yet', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    const info = await getUpdateInfo('0.0.2');
    expect(info.updateAvailable).toBe(false);
    expect(info.error).toMatch(/No releases/);
  });
});
