#!/usr/bin/env bash
# Writes .env.development.local for the one app, pointing it at the LOCAL Supabase stack.
# Keeps an existing file. Refuses any non-local target. Safe to rerun.
# `next dev` reads .env.development.local before .env.local, so a live .env.local is never used
# locally. Every Supabase variable is overridden.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENV_FILE=".env.development.local"
if [ -e "$ENV_FILE" ]; then
  echo "kept existing local env file: $ENV_FILE"
  exit 0
fi

STATUS=$(npx -y supabase@2.122.1 status -o env)
get() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -1; }
API_URL=$(get API_URL)
SERVICE_KEY=$(get SERVICE_ROLE_KEY)
ANON_KEY=$(get ANON_KEY)
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) echo "REFUSED: '$API_URL' is not a local Supabase stack." >&2; exit 1 ;;
esac
[ -n "$SERVICE_KEY" ] || { echo "REFUSED: no local service key; is 'npx -y supabase@2.122.1 start' running?" >&2; exit 1; }
git check-ignore -q "$ENV_FILE" || { echo "REFUSED: $ENV_FILE would not be gitignored." >&2; exit 1; }

PROXY_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
umask 077
printf '%s\n' \
  "# Local Supabase stack only (written by supabase/seed/write-local-env.sh)." \
  "NEXT_PUBLIC_SUPABASE_URL=$API_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" \
  "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY" "INTERNAL_PROXY_SECRET=$PROXY_SECRET" \
  "MOCK_MODE=false" "NEXT_PUBLIC_USE_MOCKS=false" > "$ENV_FILE"
echo "wrote $ENV_FILE (local Supabase stack)"
