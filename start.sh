#!/usr/bin/env sh
# ModelVerse launcher (macOS / Linux). Installs deps on first run, then starts.
set -eu
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is not installed!"
  echo "Please install Node.js 20+ from https://nodejs.org"
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "[INFO] Installing dependencies (one-time, ~250MB)..."
  npm install --omit=dev
fi

if [ ! -f "server.js" ]; then
  echo "[INFO] Building..."
  npm run build
fi

echo ""
echo "[INFO] Starting ModelVerse..."
echo "[INFO] Open http://localhost:${PORT:-3000} in your browser"
echo ""
exec node server.js
