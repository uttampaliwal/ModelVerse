/**
 * Portable release packager: builds the project and zips a clean
 * distributable (code + assets + launchers, no node_modules, no sources).
 *
 * Output: dist/modelverse-<version>-<platform>-<arch>.zip
 * Layout inside the zip: modelverse-<version>/... (extract and run ./start.sh
 * or start.bat; launchers install production deps on first run).
 */
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { arch, platform } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkg = require(join(root, 'package.json'));
const version = pkg.version || '0.0.0';
const outDir = join(root, 'dist');
const stageName = `modelverse-${version}`;
const stageDir = join(outDir, stageName);
const zipName = `modelverse-${version}-${platform()}-${arch()}.zip`;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

/** Copy compiled JS only (.ts sources stay out of the distributable). */
function copyCompiledJs(fromDir, toDir) {
  for (const file of walk(fromDir)) {
    if (!file.endsWith('.js')) continue;
    const rel = relative(fromDir, file);
    const dest = join(toDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
  }
}

/** Copy a tree while skipping TypeScript sources and build debris. */
function copyTreeFiltered(fromDir, toDir) {
  for (const file of walk(fromDir)) {
    if (file.endsWith('.ts') || file.endsWith('.tsbuildinfo') || file.endsWith('.map')) continue;
    const rel = relative(fromDir, file);
    const dest = join(toDir, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
  }
}

function copyFile(src, dest) {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

async function main() {
  console.log(`Packaging ModelVerse v${version} for ${platform()}-${arch()}...`);

  console.log('Building...');
  execSync('npm run build', { cwd: root, stdio: 'inherit' });

  if (existsSync(stageDir)) rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  // Server: compiled entry + compiled modules.
  copyFile(join(root, 'server.js'), join(stageDir, 'server.js'));
  copyCompiledJs(join(root, 'src'), join(stageDir, 'src'));

  // Frontend: static shell + compiled modules (no .ts sources).
  copyTreeFiltered(join(root, 'public'), join(stageDir, 'public'));

  // Data + metadata users need at runtime.
  for (const dir of ['profiles', 'prompts']) {
    if (existsSync(join(root, dir))) copyTreeFiltered(join(root, dir), join(stageDir, dir));
  }
  if (existsSync(join(root, 'scripts', 'data'))) {
    copyTreeFiltered(join(root, 'scripts', 'data'), join(stageDir, 'scripts', 'data'));
  }

  // Install + run metadata.
  for (const file of ['package.json', 'package-lock.json', 'README.md', 'LICENSE']) {
    if (existsSync(join(root, file))) copyFile(join(root, file), join(stageDir, file));
  }
  copyFile(join(root, 'start.sh'), join(stageDir, 'start.sh'));
  copyFile(join(root, 'start.bat'), join(stageDir, 'start.bat'));
  try {
    execSync(`chmod +x ${JSON.stringify(join(stageDir, 'start.sh'))}`);
  } catch {
    /* ignore: chmod unavailable on Windows */
  }

  // Zip with jszip (no system zip dependency, works on every runner OS).
  const zip = new JSZip();
  const staged = walk(stageDir).sort();
  for (const file of staged) {
    const rel = relative(outDir, file).split(sep).join('/');
    const stat = statSync(file);
    zip.file(rel, readFileSync(file), {
      date: new Date(stat.mtimeMs),
      unixPermissions: file.endsWith('.sh') ? 0o755 : undefined,
    });
  }
  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
  const zipPath = join(outDir, zipName);
  writeFileSync(zipPath, buffer);
  const sha = createHash('sha256').update(buffer).digest('hex');

  console.log(`\nWrote ${zipPath}`);
  console.log(`  files:  ${staged.length}`);
  console.log(`  size:   ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  sha256: ${sha}`);
  console.log('\nInstall: extract, then run ./start.sh (or start.bat on Windows).');
}

main().catch((err) => {
  console.error('Packaging failed:', err.message);
  process.exit(1);
});
