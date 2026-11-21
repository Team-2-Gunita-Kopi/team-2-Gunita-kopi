#!/usr/bin/env bash
# Seeds the SYNTHETIC localhost test dataset into the LOCAL Supabase stack (npx -y supabase@2.122.1 start).
# Refuses any non-local target. Never deletes data; refuses to run twice.
# Usage (repo root, Git Bash): bash supabase/seed/seed-localhost.sh
# Test passwords are generated here and written only to supabase/.env.seed-accounts.local (gitignored).
set -euo pipefail
cd "$(dirname "$0")/../.."

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

DB_CONTAINER=$(docker ps --format '{{.Names}}' | grep '^supabase_db_' | head -1)
[ -n "$DB_CONTAINER" ] || { echo "REFUSED: local database container not found." >&2; exit 1; }

# `next dev` reads .env.development.local before .env.local, so these point the three apps at the
# local stack without touching the live .env.local files. Every Supabase variable is overridden.
# The three files share one INTERNAL_PROXY_SECRET (sign-in answers 503 without it), so they are
# written together or not at all.
ENV_FILES="apps/api/.env.development.local apps/admin/.env.development.local apps/pos/.env.development.local"
write_env() { # file, then lines
  local f=$1; shift
  git check-ignore -q "$f" || { echo "REFUSED: $f would not be gitignored." >&2; exit 1; }
  umask 077
  printf '%s\n' "# Local Supabase stack only (written by supabase/seed/seed-localhost.sh)." "$@" > "$f"
}
if [ -n "$(ls $ENV_FILES 2>/dev/null)" ]; then
  echo "kept existing local env files: $(ls $ENV_FILES 2>/dev/null | tr '\n' ' ')"
else
  PROXY_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
  write_env apps/api/.env.development.local \
    "NEXT_PUBLIC_SUPABASE_URL=$API_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" \
    "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY" "INTERNAL_PROXY_SECRET=$PROXY_SECRET" "MOCK_MODE=false"
  for app in admin pos; do
    write_env "apps/$app/.env.development.local" \
      "NEXT_PUBLIC_SUPABASE_URL=$API_URL" "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY" \
      "NEXT_PUBLIC_API_URL=http://localhost:3002" "API_URL=http://localhost:3002" \
      "INTERNAL_PROXY_SECRET=$PROXY_SECRET" "NEXT_PUBLIC_USE_MOCKS=false"
  done
fi

ACCOUNTS=supabase/.env.seed-accounts.local
[ ! -e "$ACCOUNTS" ] || { echo "REFUSED: $ACCOUNTS exists, so the seed already ran." >&2; exit 1; }
git check-ignore -q "$ACCOUNTS" || { echo "REFUSED: $ACCOUNTS would not be gitignored." >&2; exit 1; }

pw() { node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"; }
OWNER_PW=$(pw)
BARISTA_PW=$(pw)

# Same shape as the API's own provisioning (apps/api/src/modules/employees/service.ts).
create_user() { # email password role
  curl -sf -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\",\"email_confirm\":true,\"app_metadata\":{\"role\":\"$3\"}}" |
    node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))"
}
OWNER_ID=$(create_user test-owner@example.com "$OWNER_PW" owner_admin)
BARISTA_ID=$(create_user testbarista@staff.gunitakopi.local "$BARISTA_PW" barista)

umask 077
cat > "$ACCOUNTS" <<EOF
# SYNTHETIC localhost test accounts (local Supabase only). Never commit, never reuse elsewhere.
OWNER_USERNAME=testowner
OWNER_PASSWORD=$OWNER_PW
BARISTA_USERNAME=testbarista
BARISTA_PASSWORD=$BARISTA_PW
EOF

psql_run() { docker exec -i "$DB_CONTAINER" psql -q -v ON_ERROR_STOP=1 -U postgres -d postgres "$@"; }
if [ "${SEED_DATA:-synthetic}" = demo ]; then
  # Same demo ingredients and recipes as the live project, plus accounts and opening stock.
  psql_run < supabase/seed/demo_ingredients_recipes.sql
  psql_run -v owner_id="'$OWNER_ID'" -v barista_id="'$BARISTA_ID'" < supabase/seed/demo_localhost_accounts_stock.sql
else
  psql_run -v owner_id="'$OWNER_ID'" -v barista_id="'$BARISTA_ID'" < supabase/seed/synthetic_localhost_seed.sql
fi
psql_run < supabase/seed/product_descriptions_localhost.sql

echo "Seed complete. Accounts: $ACCOUNTS"
