#!/usr/bin/env bash
# Runs every check a deploy needs, on Node 22, and stops at the first failure.
# Usage (repo root, Git Bash on Windows): bash scripts/predeploy-check.sh
set -euo pipefail

PNPM="npx -y pnpm@12.21.0"
if [[ "$(node -v)" != v22.* ]]; then
  echo "Node 22 is required (found $(node -v)). Use nvm or run from a Node 22 shell." >&2
  exit 1
fi

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
