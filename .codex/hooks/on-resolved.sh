#!/usr/bin/env bash
# Cleanup hook: clear the pending Stream Deck item for this iTerm2 session.
set -euo pipefail
cat >/dev/null
BODY="$(jq -nc --arg iterm "${ITERM_SESSION_ID:-}" '{iterm_session_id: $iterm}')"
curl -s --max-time 2 -X POST \
  "http://127.0.0.1:${BRIDGE_PORT:-8787}/hook/resolved" \
  -H 'Content-Type: application/json' -d "$BODY" >/dev/null 2>&1 || true
exit 0
