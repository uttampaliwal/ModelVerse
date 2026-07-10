import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const options = { hostname: '127.0.0.1', port: 9999, path, method, headers: {} };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = createServer(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function measure(label, fn) {
  const start = process.hrtime.bigint();
  await fn();
  const end = process.hrtime.bigint();
  const ms = Number(end - start) / 1e6;
  console.log(`  ${label}: ${ms.toFixed(2)}ms`);
}

async function main() {
  if (!existsSync(resolve(root, 'server.js'))) {
    console.log('Building...');
    spawn('npm', ['run', 'build'], { stdio: 'inherit', cwd: root });
  }

  console.log('\nStarting server...');
  const server = spawn('node', ['server.js'], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, PORT: '9999' },
  });

  // wait for server to start
  await new Promise((resolve) => {
    server.stdout.on('data', (data) => {
      if (data.toString().includes('listening') || data.toString().includes('port')) resolve();
      // also resolve after 3s regardless
      setTimeout(resolve, 3000);
    });
    setTimeout(resolve, 3000);
  });

  console.log('\nBenchmark results:');
  console.log('-----------------');

  await measure('GET /', () => request('GET', '/'));
  await measure('GET /api/profiles', () => request('GET', '/api/profiles'));
  await measure('GET /api/models', () => request('GET', '/api/models'));
  await measure('GET /api/settings', () => request('GET', '/api/settings'));

  console.log('-----------------\n');

  server.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
