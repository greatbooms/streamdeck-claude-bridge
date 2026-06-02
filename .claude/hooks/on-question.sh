#!/usr/bin/env bash
# PreToolUse(AskUserQuestion): env ITERM_SESSION_ID + stdin 질문을 브릿지로 POST.
# 브릿지가 꺼져 있어도 claude 를 막지 않도록 항상 exit 0.
set -euo pipefail
RAW="$(cat)"
BODY="$(jq -nc \
  --arg iterm "${ITERM_SESSION_ID:-}" \
  --argjson payload "$RAW" \
  '{iterm_session_id: $iterm,
    claude_session_id: ($payload.session_id // ""),
    questions: ($payload.tool_input.questions // [])}')"
curl -s --max-time 2 -X POST \
  "http://127.0.0.1:${BRIDGE_PORT:-8787}/hook/question" \
  -H 'Content-Type: application/json' -d "$BODY" >/dev/null 2>&1 || true
exit 0
