import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(__dirname, '..', 'logs');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROTATED = 3;

interface LogStream {
  stream: fs.WriteStream;
  bytes: number;
}

/**
 * Async file logging with size-based rotation.
 *
 * Writes go through a WriteStream per file (never blocks the event loop like
 * appendFileSync did) and rotate at MAX_FILE_BYTES, keeping MAX_ROTATED
 * older files (<name>.1, <name>.2, ...). The public API stays synchronous
 * (void) so all existing call sites keep working.
 */
const streams = new Map<string, LogStream>();

function fileSize(file: string): number {
  try {
    return fs.statSync(path.join(LOG_DIR, file)).size;
  } catch {
    return 0;
  }
}

function rotate(file: string): void {
  try {
    for (let i = MAX_ROTATED - 1; i >= 1; i--) {
      const older = path.join(LOG_DIR, `${file}.${i}`);
      const newer = path.join(LOG_DIR, `${file}.${i + 1}`);
      if (fs.existsSync(older)) fs.renameSync(older, newer);
    }
    const current = path.join(LOG_DIR, file);
    if (fs.existsSync(current)) fs.renameSync(current, path.join(LOG_DIR, `${file}.1`));
  } catch {
    /* ignore: rotation is best-effort */
  }
}

function getStream(file: string): LogStream | null {
  const existing = streams.get(file);
  if (existing) return existing;
  try {
    const stream = fs.createWriteStream(path.join(LOG_DIR, file), { flags: 'a' });
    stream.on('error', () => {
      streams.delete(file);
    });
    const entry: LogStream = { stream, bytes: fileSize(file) };
    streams.set(file, entry);
    return entry;
  } catch {
    return null;
  }
}

function write(file: string, msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${ts}] ${msg}\n`;
  try {
    const entry = getStream(file);
    if (!entry) return;
    if (entry.bytes + Buffer.byteLength(line) > MAX_FILE_BYTES) {
      try {
        entry.stream.end();
      } catch {
        /* ignore */
      }
      streams.delete(file);
      rotate(file);
      const fresh = getStream(file);
      if (!fresh) return;
      fresh.stream.write(line);
      fresh.bytes = Buffer.byteLength(line);
      return;
    }
    entry.stream.write(line);
    entry.bytes += Buffer.byteLength(line);
  } catch {
    /* ignore: logging must never crash the server */
  }
}

export const log = {
  server(msg: string): void {
    const line = `[SERVER] ${msg}`;
    console.log(line);
    write('server.log', line);
  },

  engine(msg: string): void {
    const line = `[ENGINE] ${msg}`;
    console.log(line);
    write('engine.log', line);
  },

  error(msg: string, err?: Error): void {
    const stack = err?.stack ? `\n${err.stack}` : '';
    const line = `[ERROR] ${msg}${stack}`;
    console.error(line);
    write('errors.log', line);
  },
};
