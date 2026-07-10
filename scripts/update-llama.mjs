#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const BIN_DIR = join(import.meta.dirname, '..', 'bin');

console.log('Checking latest llama.cpp release...');
const release = JSON.parse(
  execSync('curl -s https://api.github.com/repos/ggml-org/llama.cpp/releases/latest', { encoding: 'utf-8' })
);
const version = release.tag_name;
console.log(`Latest version: ${version}`);

const asset = release.assets.find(a => a.name.includes('win') && a.name.includes('cuda-13.3') && a.name.endsWith('.zip'));
if (!asset) {
  console.error('No Windows CUDA 13.3 binary found');
  process.exit(1);
}

console.log(`Downloading ${asset.name}...`);
const zipPath = join(tmpdir(), 'llama-update.zip');
execSync(`curl -L -o "${zipPath}" "${asset.browser_download_url}"`, { stdio: 'inherit' });

if (existsSync(BIN_DIR)) {
  console.log('Removing old binaries...');
  rmSync(BIN_DIR, { recursive: true, force: true });
}
mkdirSync(BIN_DIR, { recursive: true });

console.log('Extracting...');
execSync(`tar -xf "${zipPath}" -C "${BIN_DIR}"`, { stdio: 'inherit' });
rmSync(zipPath);

console.log(`\nDone! llama.cpp ${version} installed to bin/`);
