#!/usr/bin/env bash
set -euo pipefail
payload="${1:?payload json path}"
host="${HF_SSH_HOST:-forge@3.36.39.123}"
key="${HF_SSH_KEY:-$HOME/.ssh/honest-family.pem}"
name="blogpost-$(date +%s)-$$.json"
scp -q -i "$key" "$payload" "$host:/tmp/$name"
ssh -i "$key" "$host" bash -s -- "$name" <<'REMOTE'
set -euo pipefail
f="/tmp/$1"
umask 077
hf="$(mktemp)"
trap 'rm -f "$hf" "$f"' EXIT
cd /home/forge/api.honest-family.com
k="$(php8.2 artisan tinker --execute="echo config('services.insights.bridge_key');" 2>/dev/null | tr -d '\r\n')"
[ -n "$k" ] || { echo "bridge key not found"; exit 1; }
printf 'X-Insights-Bridge-Key: %s\n' "$k" > "$hf"
unset k
curl -sS -o /tmp/"$1".out -w '%{http_code}\n' -X POST \
  -H @"$hf" -H 'Accept: application/json' -H 'Content-Type: application/json' \
  --data-binary @"$f" https://api.honest-family.com/api/bridge/insights/blog-posts/upsert
head -c 1200 /tmp/"$1".out; echo
rm -f /tmp/"$1".out
REMOTE
