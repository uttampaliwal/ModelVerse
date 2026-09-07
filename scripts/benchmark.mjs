import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PORT = 9999;
const BASE = `http://127.0.0.1:${PORT}`;

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function measure(label, fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  console.log(`  ${label}: ${ms.toFixed(2)}ms (status ${result.status})`);
  return result;
}

function waitForServer(server) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    server.stdout.on('data', (data) => {
      const text = data.toString();
      process.stdout.write(text);
      if (/ModelVerse|listening|http:\/\/localhost/i.test(text)) finish();
    });
    setTimeout(finish, 4000);
  });
}

async function main() {
  if (!existsSync(resolve(root, 'server.js'))) {
    console.log('Building...');
    await new Promise((resolvePromise, rejectPromise) => {
      const child = spawn('npm', ['run', 'build'], { stdio: 'inherit', cwd: root, shell: true });
      child.on('exit', (code) =>
        code === 0 ? resolvePromise() : rejectPromise(new Error(`build exited ${code}`)),
      );
      child.on('error', rejectPromise);
    });
  }

  console.log('\nStarting server...');
  const server = spawn('node', ['server.js'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, PORT: String(PORT) },
  });

  await waitForServer(server);

  console.log('\nBenchmark results:');
  console.log('-----------------');

  try {
    await measure('GET /', () => request('GET', '/'));
    await measure('GET /api/profiles', () => request('GET', '/api/profiles'));
    await measure('GET /api/models', () => request('GET', '/api/models'));
    await measure('GET /api/settings', () => request('GET', '/api/settings'));
  } finally {
    server.kill();
  }

  console.log('-----------------\n');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
