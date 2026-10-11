#!/usr/bin/env bash
#
# CloudOps Hub - API smoke test.
#
# Verifies the real account lifecycle against a running API:
#   liveness, register a throwaway account, log in, authenticated calls,
#   change the password, log in again with it, old password rejected.
#
# Usage:
#   ./scripts/smoke-test.sh
#   BASE_URL=http://localhost:4000 ./scripts/smoke-test.sh
#
set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000}"

STAMP="$(date +%Y%m%d%H%M%S%N 2>/dev/null || date +%s)"
EMAIL="smoke-${STAMP}@example.com"
NAME="Smoke Tester"
PASSWORD='Smoke!Pass123'
NEW_PASSWORD='Smoke!Pass456'

PASS_COUNT=0
FAIL_COUNT=0
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

step() { printf '\n==> %s\n' "$1"; }
pass() { PASS_COUNT=$((PASS_COUNT + 1)); printf '    PASS  %s\n' "$1"; }
fail() {
  FAIL_COUNT=$((FAIL_COUNT + 1))
  printf '    FAIL  %s\n' "$1" >&2
  if [ -n "${2:-}" ]; then printf '          %s\n' "$2" >&2; fi
}

# request METHOD PATH [TOKEN] -> prints http status code, body in $TMP_DIR/body
request() {
  local method="$1" path="$2" token="${3:-}"
  local -a args=(-sS -X "$method" -o "$TMP_DIR/body" -w '%{http_code}' --max-time 30
                 -H 'Content-Type: application/json')
  if [ -n "$token" ]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  curl "${args[@]}" "$BASE_URL$path" 2>"$TMP_DIR/stderr" || echo "000"
}

# post_json PATH JSON [TOKEN] -> prints http status code, body in $TMP_DIR/body
post_json() {
  local path="$1" json="$2" token="${3:-}"
  local -a args=(-sS -X POST -o "$TMP_DIR/body" -w '%{http_code}' --max-time 30
                 -H 'Content-Type: application/json' -d "$json")
  if [ -n "$token" ]; then
    args+=(-H "Authorization: Bearer $token")
  fi
  curl "${args[@]}" "$BASE_URL$path" 2>"$TMP_DIR/stderr" || echo "000"
}

body() { cat "$TMP_DIR/body" 2>/dev/null || true; }

json_value() {
  # json_value <key> - extracts the first top-level-ish string value for <key>
  local key="$1"
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg k "$key" '.. | objects | select(has($k)) | .[$k]' "$TMP_DIR/body" 2>/dev/null | head -n 1
  else
    sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\\([^\"]*\\)\".*/\\1/p" "$TMP_DIR/body" | head -n 1
  fi
}

echo "CloudOps Hub - smoke test"
echo "Target:  $BASE_URL"
echo "Account: $EMAIL (created by this run)"

# 1) Liveness ---------------------------------------------------------------
step "GET /health"
STATUS="$(request GET /health)"
if [ "$STATUS" = "200" ]; then
  pass "/health returned 200"
else
  fail "/health returned $STATUS" "$(body)"
fi

# 2) Register a throwaway account ------------------------------------------
step "POST /api/auth/register ($EMAIL)"
STATUS="$(post_json /api/auth/register "{\"email\":\"$EMAIL\",\"name\":\"$NAME\",\"password\":\"$PASSWORD\"}")"
if [ "$STATUS" = "201" ]; then
  pass "register returned 201 (account stored with a hashed password)"
else
  fail "register returned $STATUS" "$(body)"
fi

# 3) Log in with those credentials -----------------------------------------
step "POST /api/auth/login (new account)"
STATUS="$(post_json /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
TOKEN=""
if [ "$STATUS" = "200" ]; then
  TOKEN="$(json_value accessToken)"
  if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
    pass "login succeeded with the registered email + password"
  else
    fail "login returned 200 but no accessToken was found" "$(body)"
  fi
else
  fail "login returned $STATUS" "$(body)"
fi

# 4) Authenticated calls ----------------------------------------------------
if [ -n "$TOKEN" ]; then
  step "GET /api/health"
  STATUS="$(request GET /api/health "$TOKEN")"
  if [ "$STATUS" = "200" ]; then pass "/api/health returned 200"; else fail "/api/health returned $STATUS" "$(body)"; fi

  step "GET /api/auth/me"
  STATUS="$(request GET /api/auth/me "$TOKEN")"
  if [ "$STATUS" = "200" ] && grep -q "$EMAIL" "$TMP_DIR/body" 2>/dev/null; then
    pass "/api/auth/me returned the registered identity"
  else
    fail "/api/auth/me did not echo the registered email" "$(body)"
  fi

  step "GET /api/dashboard/summary"
  STATUS="$(request GET /api/dashboard/summary "$TOKEN")"
  if [ "$STATUS" = "200" ]; then pass "/api/dashboard/summary returned 200"; else fail "/api/dashboard/summary returned $STATUS" "$(body)"; fi

  # 5) Change the password -------------------------------------------------
  step "POST /api/auth/change-password"
  STATUS="$(post_json /api/auth/change-password "{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"$NEW_PASSWORD\"}" "$TOKEN")"
  if [ "$STATUS" = "200" ]; then pass "password changed"; else fail "change-password returned $STATUS" "$(body)"; fi

  # 6) New password works, old one does not --------------------------------
  step "POST /api/auth/login (updated password)"
  STATUS="$(post_json /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$NEW_PASSWORD\"}")"
  NEW_TOKEN=""
  if [ "$STATUS" = "200" ]; then NEW_TOKEN="$(json_value accessToken)"; fi
  if [ -n "$NEW_TOKEN" ] && [ "$NEW_TOKEN" != "null" ]; then
    pass "login with the new password succeeded"
  else
    fail "login with the new password returned $STATUS" "$(body)"
  fi

  step "POST /api/auth/login (old password must fail)"
  STATUS="$(post_json /api/auth/login "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")"
  if [ "$STATUS" = "401" ]; then pass "old password rejected with 401"; else fail "old password returned $STATUS instead of 401" "$(body)"; fi
else
  fail "skipped authenticated steps - no access token from login"
fi

# Summary -------------------------------------------------------------------
echo ""
echo "Result: $PASS_COUNT passed, $FAIL_COUNT failed"
if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
echo "Smoke test passed."
