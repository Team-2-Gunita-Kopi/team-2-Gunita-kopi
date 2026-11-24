#!/usr/bin/env bash
# Stages the Vercel firewall rules from the deploy spec (section 5.3) in LOG mode only.
# It never publishes: review traffic in the Vercel dashboard for a day, switch each rule to
# enforce with `vercel firewall rules edit`, then a person runs `vercel firewall publish --yes`.
# Usage (repo root, after `vercel link`): bash scripts/vercel-firewall.sh [pro]
set -euo pipefail

VERCEL="npx -y vercel@66.6.0"

# Rerunning must not stage duplicates: skip rules that already exist by name.
has_rule() { $VERCEL firewall rules list 2>/dev/null | grep -qF "$1"; }

# Hobby allows 3 custom rules, one of them a rate limit.
has_rule "Sign-in rate limit" || $VERCEL firewall rules add "Sign-in rate limit" \
  --condition '{"type":"path","op":"pre","value":"/admin/auth/"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --or \
  --condition '{"type":"path","op":"pre","value":"/staff/auth/"}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 20 \
  --rate-limit-keys ip \
  --rate-limit-action log \
  --yes

has_rule "Probe block" || $VERCEL firewall rules add "Probe block" \
  --condition '{"type":"path","op":"inc","value":["/wp-admin","/wp-login.php","/.env","/.git","/.git/config","/phpmyadmin"]}' \
  --or \
  --condition '{"type":"path","op":"suf","value":".php"}' \
  --action log \
  --yes

# Owner portal reachable only from the Philippines (the POS under /staff is not affected).
has_rule "Owner portal: Philippines only" || $VERCEL firewall rules add "Owner portal: Philippines only" \
  --condition '{"type":"path","op":"pre","value":"/admin"}' \
  --condition '{"type":"geo_country","op":"eq","value":"PH","neg":true}' \
  --action log \
  --yes

if [[ "${1:-}" == "pro" ]]; then
  has_rule "API rate limit" || $VERCEL firewall rules add "API rate limit" \
    --condition '{"type":"path","op":"pre","value":"/admin/api/"}' \
    --or \
    --condition '{"type":"path","op":"pre","value":"/staff/api/"}' \
    --action rate_limit \
    --rate-limit-window 60 \
    --rate-limit-requests 300 \
    --rate-limit-keys ip \
    --rate-limit-action log \
    --yes
fi

$VERCEL firewall diff
echo
echo "Staged in LOG mode. Nothing is live until a person runs: vercel firewall publish --yes"
