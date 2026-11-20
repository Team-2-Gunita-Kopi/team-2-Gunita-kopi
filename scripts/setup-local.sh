#!/usr/bin/env bash
# One-command local setup for a new developer machine (Git Bash on Windows, or any bash).
#   bash scripts/setup-local.sh
# Checks the tools, installs packages, starts the LOCAL Supabase stack, seeds synthetic test data
# once, and prints the links and test accounts. Safe to run again: it keeps existing files and data.
# Never touches the live Supabase project. Afterwards start the apps with: npx -y pnpm@12.21.0 dev
set -euo pipefail
cd "$(dirname "$0")/.."

fail() { echo "SETUP STOPPED: $*" >&2; exit 1; }
step() { echo; echo "== $*"; }

step "Checking tools"
command -v git >/dev/null || fail "Git is not installed (https://git-scm.com)."
command -v node >/dev/null || fail "Node.js is not installed (https://nodejs.org, version 22)."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 22 ] || fail "Node.js $NODE_MAJOR found; install version 22 (https://nodejs.org)."
command -v docker >/dev/null || fail "Docker Desktop is not installed (https://www.docker.com/products/docker-desktop)."
docker ps >/dev/null 2>&1 || fail "Docker Desktop is not running. Open it, wait until it says 'running', then run this again."
echo "git, node $(node -v), docker: ok"

step "Installing packages (first time takes a few minutes)"
npx -y pnpm@12.21.0 install --frozen-lockfile

step "Email settings for the local stack"
if [ -e supabase/.env ]; then
  echo "kept existing supabase/.env"
else
  cp supabase/.env.example supabase/.env
  echo "created supabase/.env (sign-in codes go to the local inbox http://127.0.0.1:54326)"
fi

step "Starting local Supabase (first time downloads images, 5-15 minutes)"
npx -y supabase@2.122.1 start >/dev/null
npx -y supabase@2.122.1 migration up --local >/dev/null
echo "local Supabase running, migrations up to date"

step "Test data"
if [ -e supabase/.env.seed-accounts.local ]; then
  echo "already seeded (kept)"
else
  bash supabase/seed/seed-localhost.sh
fi

step "Done"
cat <<EOF
Start the apps:   npx -y pnpm@12.21.0 dev
  Admin (Owner):  http://localhost:3000
  POS (Barista):  http://localhost:3001
  API:            http://localhost:3002
  Sign-in codes:  http://127.0.0.1:54326  (Owner: after the password, open the newest email)
Test accounts (local only):
$(grep -E '^(OWNER|BARISTA)_' supabase/.env.seed-accounts.local | sed 's/^/  /')
EOF
