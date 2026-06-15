#!/usr/bin/env bash
# PermissionRequest: send Codex approval prompt details plus ITERM_SESSION_ID to the bridge.
# The hook must never block Codex if the bridge is unavailable.
set -euo pipefail
RAW="$(cat)"
BODY="$(jq -nc \
  --arg iterm "${ITERM_SESSION_ID:-}" \
  --argjson payload "$RAW" \
  '{iterm_session_id: $iterm, payload: $payload}')"
curl -s --max-time 2 -X POST \
  "http://127.0.0.1:${BRIDGE_PORT:-8787}/hook/codex/permission" \
  -H 'Content-Type: application/json' -d "$BODY" >/dev/null 2>&1 || true
exit 0
