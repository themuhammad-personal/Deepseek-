#!/usr/bin/env bash
# Probe what chat.deepseek.com actually enforces, endpoint by endpoint.
#
# Why this exists: the project was built around the assumption that an AWS WAF
# blocks the whole API, which is why chat traffic is routed through a 4-hop
# WebView <-> Kotlin bridge. It does not. Only the HTML pages and /users/login
# are behind the WAF; session create, PoW challenge and completion are reachable
# from any plain HTTP client.
#
# Run: bash tools/probe-deepseek.sh
# No credentials needed — every call is unauthenticated on purpose.

set -u

BASE="https://chat.deepseek.com/api/v0"
BROWSER_UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
OKHTTP_UA="okhttp/4.12.0"

probe() {
  local label="$1"; shift
  local out
  out=$(curl -sS -m 25 -D /tmp/_hdrs -o /tmp/_body "$@" 2>&1)
  local code waf
  code=$(grep -i '^HTTP/' /tmp/_hdrs | tail -1 | awk '{print $2}')
  waf=$(grep -i '^x-amzn-waf-action:' /tmp/_hdrs | tr -d '\r' | awk '{print $2}')
  local size; size=$(wc -c < /tmp/_body | tr -d ' ')
  printf '%-42s HTTP %-4s waf=%-10s size=%-6s %s\n' \
    "$label" "${code:-?}" "${waf:--}" "$size" "$(head -c 70 /tmp/_body | tr -d '\n')"
}

echo "DeepSeek endpoint probe — $(date -u +%FT%TZ)"
echo "--------------------------------------------------------------------------------------------"

echo "[WAF-protected surface]"
probe "GET /  (plain headers)"      -A "$BROWSER_UA" "https://chat.deepseek.com/"
probe "POST /users/login (browser)" -A "$BROWSER_UA" -H 'Content-Type: application/json' \
      -H 'Origin: https://chat.deepseek.com' -H 'Referer: https://chat.deepseek.com/' \
      -X POST "$BASE/users/login" --data '{"email":"a@b.c","password":"x","os":"web"}'

echo
echo "[Chat pipeline — note: NO waf= header on any of these]"
probe "POST /chat_session/create"   -A "$OKHTTP_UA" -H 'Content-Type: application/json' \
      -X POST "$BASE/chat_session/create" --data '{}'
probe "POST /chat/create_pow_challenge" -A "$OKHTTP_UA" -H 'Content-Type: application/json' \
      -X POST "$BASE/chat/create_pow_challenge" --data '{"target_path":"/api/v0/chat/completion"}'
probe "POST /chat/completion"       -A "$OKHTTP_UA" -H 'Content-Type: application/json' \
      -X POST "$BASE/chat/completion" \
      --data '{"chat_session_id":"x","parent_message_id":null,"prompt":"hi","ref_file_ids":[],"thinking_enabled":false,"search_enabled":false,"preempt":false}'
probe "GET  /users/current"         -A "$OKHTTP_UA" "$BASE/users/current"

echo
echo "[Auth model: which credential does DeepSeek actually read?]"
probe "Bearer garbage only"         -A "$OKHTTP_UA" -H 'Content-Type: application/json' \
      -H 'Authorization: Bearer garbage_token_value' \
      -X POST "$BASE/chat_session/create" --data '{}'
probe "Cookie ds_web_token only"    -A "$OKHTTP_UA" -H 'Content-Type: application/json' \
      -H 'Cookie: ds_web_token=garbage_token_value' \
      -X POST "$BASE/chat_session/create" --data '{}'

echo
echo "Reading the output:"
echo "  * waf=challenge + HTTP 202  -> behind AWS WAF, needs a real browser context"
echo "  * HTTP 200 + JSON code/msg  -> plain HTTP works, no WAF, no browser needed"
echo "  * 40002 'Missing Token' vs 40003 'invalid token' shows which header is read"
