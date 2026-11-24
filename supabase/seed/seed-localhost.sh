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

# Points the app at the local stack (.env.development.local); keeps an existing file.
bash supabase/seed/write-local-env.sh

ACCOUNTS=supabase/.env.seed-accounts.local
[ ! -e "$ACCOUNTS" ] || { echo "REFUSED: $ACCOUNTS exists, so the seed already ran." >&2; exit 1; }
git check-ignore -q "$ACCOUNTS" || { echo "REFUSED: $ACCOUNTS would not be gitignored." >&2; exit 1; }

pw() { node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"; }
OWNER_PW=$(pw)
BARISTA_PW=$(pw)

# Same shape as the API's own provisioning (src/server/modules/employees/service.ts).
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
