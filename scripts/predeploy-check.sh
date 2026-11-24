#!/usr/bin/env bash
# Runs every check a deploy needs, on Node 22, and stops at the first failure.
# Usage (repo root, Git Bash on Windows): bash scripts/predeploy-check.sh
set -euo pipefail

PNPM="npx -y pnpm@12.21.0"

# The repo needs Node 22 (newer Node breaks the jsdom tests). If the default is different, use a
# Node 22 that npx downloads once and caches, for this run only; nothing on the machine changes.
if [[ "$(node -v)" != v22.* ]]; then
  echo "==> Default Node is $(node -v); using Node 22 for this run"
  N22="$(npx -y node@22 -p 'process.execPath')"
  [[ "$N22" == *:\\* ]] && N22="$(cygpath -u "$N22")" # Git Bash on Windows
  BIN="${TMPDIR:-/tmp}/gunita-node22"
  mkdir -p "$BIN"
  if [[ "$N22" == *.exe ]]; then
    ln -f "$N22" "$BIN/node.exe" 2>/dev/null || cp -f "$N22" "$BIN/node.exe"
  else
    ln -sf "$N22" "$BIN/node"
  fi
  export PATH="$BIN:$PATH"
  hash -r
fi
if [[ "$(node -v)" != v22.* ]]; then
  echo "Node 22 is required (found $(node -v)). Install it with nvm, or run from a Node 22 shell." >&2
  exit 1
fi
echo "==> Node $(node -v)"

step() {
  local name="$1"
  shift
  echo "==> $name"
  if ! "$@"; then
    echo "FAILED: $name" >&2
    exit 1
  fi
}

step "install" $PNPM install --frozen-lockfile
step "lint" $PNPM lint
step "typecheck" $PNPM typecheck
step "test" $PNPM test
step "build" $PNPM build
step "audit (high and above)" $PNPM audit --prod --audit-level high

echo "All pre-deploy checks passed."
