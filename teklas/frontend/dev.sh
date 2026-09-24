#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  echo 'Node.js 22.13+ ve pnpm 11 kurulu olmalı. Ana README.md dosyasına bakın.' >&2
  exit 1
fi
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi
exec pnpm dev
