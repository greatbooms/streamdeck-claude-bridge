#!/usr/bin/env bash
#
# PoC 1: PreToolUse(AskUserQuestion) 훅 발화 검증용 덤프 스크립트
#
# 클로드가 AskUserQuestion 도구를 쓰기 직전에 이 스크립트가 호출되는지,
# 그리고 stdin 으로 질문/선택지 JSON 이 들어오는지를 확인한다.
# 부수효과만 남기고(파일 기록) 클로드 동작에는 일절 개입하지 않는다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/../logs"
mkdir -p "$LOG_DIR"

# 훅이 stdin 으로 받은 원본 JSON
RAW_INPUT="$(cat)"

TS="$(date '+%Y-%m-%dT%H:%M:%S%z')"

# 사람이 보기 쉬운 요약 로그
{
  echo "==================== $TS ===================="
  echo "ITERM_SESSION_ID = ${ITERM_SESSION_ID:-<none>}"
  echo "TERM_PROGRAM     = ${TERM_PROGRAM:-<none>}"
  echo "--- raw stdin JSON ---"
  echo "$RAW_INPUT"
  echo "--- 추출 시도: 질문 / 선택지 ---"
  echo "$RAW_INPUT" | jq -r '
    try (
      .tool_input.questions[]
      | "Q: \(.question)\n   header: \(.header)\n   options: \([.options[].label] | join(" | "))"
    ) catch "  (questions 구조를 찾지 못함 — 위 raw JSON 확인)"
  ' 2>/dev/null || echo "  (jq 파싱 실패 — 위 raw JSON 확인)"
  echo ""
} >> "$LOG_DIR/hook-events.log"

# 기계 처리용: 원본 JSON 에 메타 정보 추가해서 한 줄씩 기록
echo "$RAW_INPUT" | jq -c \
  --arg ts "$TS" \
  --arg iterm "${ITERM_SESSION_ID:-}" \
  '{ts: $ts, iterm_session_id: $iterm, payload: .}' \
  >> "$LOG_DIR/hook-events.jsonl" 2>/dev/null || true

# 항상 정상 종료 (클로드 차단 금지)
exit 0
