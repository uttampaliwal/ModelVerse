import fs from 'fs';
import path from 'path';
import { log } from './logger';

export interface DownloadRequest {
  repo: string;
  file: string;
  filename?: string;
}

export interface DownloadProgress {
  id: string;
  repo: string;
  file: string;
  destPath: string;
  status: 'downloading' | 'completed' | 'failed' | 'cancelled';
  receivedBytes: number;
  totalBytes: number | null;
  error?: string;
}

const ALLOWED_EXTENSIONS = ['.gguf', '.bin', '.safetensors'];
const DOWNLOAD_TIMEOUT_MS = 30000;

export function defaultModelsDir(): string {
  const dir = path.join(process.cwd(), 'models');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Validate a download request; returns an error message or null when valid. */
export function validateDownloadRequest(req: DownloadRequest): string | null {
  if (
    !req ||
    typeof req.repo !== 'string' ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(req.repo)
  ) {
    return 'repo must look like "owner/model-name"';
  }
  if (typeof req.file !== 'string' || req.file.includes('..') || req.file.includes('\\')) {
    return 'file must be a repository-relative path without ".."';
  }
  const lower = req.file.toLowerCase();
  if (!ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return `file must end with one of: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }
  if (req.filename !== undefined) {
    if (typeof req.filename !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(req.filename)) {
      return 'filename must be a plain file name without directories';
    }
    const lowerName = req.filename.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      return `filename must end with one of: ${ALLOWED_EXTENSIONS.join(', ')}`;
    }
  }
  return null;
}

/** Build the Hugging Face resolve URL for a validated request. */
export function buildDownloadUrl(req: DownloadRequest): string {
  return `https://huggingface.co/${req.repo}/resolve/main/${req.file}`;
}

/** Resolve the on-disk destination, jailed inside the models directory. */
export function resolveDestPath(req: DownloadRequest, modelsDir?: string): string {
  const dir = path.resolve(modelsDir ?? defaultModelsDir());
  const base = req.filename ?? path.basename(req.file);
  const dest = path.resolve(dir, base);
  if (path.relative(dir, dest).startsWith('..') || dest === dir) {
    throw new Error('Destination escapes the models directory');
  }
  return dest;
}

const downloads = new Map<string, { progress: DownloadProgress; abort: AbortController }>();
let downloadSeq = 0;

export function getDownload(id: string): DownloadProgress | undefined {
  return downloads.get(id)?.progress;
}

export function listDownloads(): DownloadProgress[] {
  return [...downloads.values()].map((d) => ({ ...d.progress }));
}

export function cancelDownload(id: string): boolean {
  const entry = downloads.get(id);
  if (!entry || entry.progress.status !== 'downloading') return false;
  entry.abort.abort();
  entry.progress.status = 'cancelled';
  return true;
}

export async function startDownload(req: DownloadRequest, modelsDir?: string): Promise<string> {
  const validationError = validateDownloadRequest(req);
  if (validationError) throw new Error(validationError);
  const destPath = resolveDestPath(req, modelsDir);
  if (fs.existsSync(destPath)) throw new Error(`File already exists: ${path.basename(destPath)}`);

  const id = `dl_${Date.now().toString(36)}_${(downloadSeq++).toString(36)}`;
  const abort = new AbortController();
  const progress: DownloadProgress = {
    id,
    repo: req.repo,
    file: req.file,
    destPath,
    status: 'downloading',
    receivedBytes: 0,
    totalBytes: null,
  };
  downloads.set(id, { progress, abort });

  void runDownload(id, buildDownloadUrl(req), destPath, abort.signal);
  return id;
}

async function runDownload(
  id: string,
  url: string,
  destPath: string,
  signal: AbortSignal,
): Promise<void> {
  const entry = downloads.get(id);
  if (!entry) return;
  const { progress } = entry;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)]),
    });
    if (!res.ok || !res.body) {
      throw new Error(`Download failed: HTTP ${res.status}`);
    }
    const total = res.headers.get('content-length');
    progress.totalBytes = total ? Number(total) : null;

    await new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(destPath);
      const reader = res.body!.getReader();
      signal.addEventListener('abort', () => {
        reader.cancel().catch(() => undefined);
        fileStream.destroy();
        reject(new Error('cancelled'));
      });
      const pump = (): void => {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              fileStream.end(() => resolve());
              return;
            }
            progress.receivedBytes += value.byteLength;
            if (!fileStream.write(value)) {
              fileStream.once('drain', pump);
            } else {
              pump();
            }
          })
          .catch(reject);
      };
      fileStream.on('error', reject);
      pump();
    });

    progress.status = 'completed';
    log.server(`Model download completed: ${destPath} (${progress.receivedBytes} bytes)`);
  } catch (e) {
    const err = e as Error;
    if (progress.status === 'cancelled' || err.message === 'cancelled') {
      progress.status = 'cancelled';
      try {
        fs.rmSync(destPath, { force: true });
      } catch {
        /* ignore */
      }
    } else {
      progress.status = 'failed';
      progress.error = err.message;
      try {
        fs.rmSync(destPath, { force: true });
      } catch {
        /* ignore partial file */
      }
    }
    log.error('Model download failed', err);
  }
}
