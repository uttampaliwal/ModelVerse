import { log } from './logger';

export interface UpdateInfo {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  checkedAt: string;
  error?: string;
}

const RELEASES_URL = 'https://api.github.com/repos/uttampaliwal/ModelVerse/releases/latest';
const FETCH_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let cached: { info: UpdateInfo; at: number } | null = null;

/** True when `latest` is a newer semver version than `current`. */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string): [number, number, number] | null => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
    if (!match) return null;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const a = parse(current);
  const b = parse(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (b[i] > a[i]) return true;
    if (b[i] < a[i]) return false;
  }
  return false;
}

async function fetchLatestTag(): Promise<string> {
  const res = await fetch(RELEASES_URL, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ModelVerse' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.status === 404) throw new Error('No releases published yet');
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  const data = (await res.json()) as { tag_name?: unknown };
  if (typeof data.tag_name !== 'string' || !data.tag_name.trim()) {
    throw new Error('Malformed release response');
  }
  return data.tag_name.trim().replace(/^v/, '');
}

/** Check for updates (cached 6h). Never throws — failures are in UpdateInfo. */
export async function getUpdateInfo(current: string): Promise<UpdateInfo> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS && cached.info.current === current) {
    return cached.info;
  }
  const checkedAt = new Date().toISOString();
  try {
    const latest = await fetchLatestTag();
    const info: UpdateInfo = {
      current,
      latest,
      updateAvailable: isNewerVersion(current, latest),
      checkedAt,
    };
    cached = { info, at: Date.now() };
    return info;
  } catch (e) {
    const info: UpdateInfo = {
      current,
      latest: null,
      updateAvailable: false,
      checkedAt,
      error: (e as Error).message,
    };
    log.error('Update check failed', e as Error);
    return info;
  }
}

/** Test hook: clear the in-memory cache. */
export function clearUpdateCache(): void {
  cached = null;
}
