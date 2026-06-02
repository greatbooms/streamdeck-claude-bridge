# streamdeck-claude-bridge

클로드코드의 질문(AskUserQuestion)을 스트림덱으로 미러링하고,
스트림덱 버튼으로 iTerm2 세션에 답변을 주입하는 브릿지 프로젝트.

## 목표 아키텍처

```
[클로드 질문]
  └─(PreToolUse 훅, AskUserQuestion)→ 선택지 + ITERM_SESSION_ID 를 브릿지로 전송
[로컬 브릿지 서버]
  └─(WebSocket)→ 스트림덱 플러그인 (전용 프로파일 전환, 버튼에 질문/번호 표시)
[사용자가 스트림덱 버튼 N 누름]
  └─ 브릿지 → iTerm2 Python API 로 해당 세션에 방향키+Enter 주입 → 답변 선택
```

## 진행 단계

- [x] **PoC 1 — 훅 발화 검증** (완료 ✅)
  - [x] `PreToolUse`(matcher: `AskUserQuestion`) 훅 발화 → **성공**
  - [x] stdin JSON 에 질문/선택지(`tool_input.questions[].options[].label`) 수신 → **성공**
  - [x] stdin JSON 에 `session_id` / `transcript_path` / `cwd` 포함 확인 → **성공**
  - [x] `$ITERM_SESSION_ID` 캡처 → **성공** (iTerm2 에서 *이 프로젝트 폴더*로 띄운 claude 에서):
        `ITERM_SESSION_ID = w0t1p0:C7181934-...` 기록됨. ':' 뒤 UUID 가
        iTerm2 API `session.session_id` 와 **완전 일치** 확인.
- [x] **PoC 2 — iTerm2 키 주입 검증** (완료 ✅)
  - [x] 세션 UUID 로 **정확히 한 세션에만** 키 주입 → **성공, 오발사 0건**
        (같은 창 옆 탭/다른 창에 안 샘. `scripts/inject-keys.py` + `read-screen.py` 로 교차검증)
  - [x] `async_send_text` 가 포커스 무관하게 대상 세션에 직접 전달됨 확인
  - [x] AskUserQuestion CLI 메뉴 **선택 키 시퀀스 실측 완료**:
        메뉴 푸터 = `Enter to select · ↑/↓ to navigate · Esc to cancel`.
        실측: `down`(\x1b[B) → 커서 ❯ 1→2 이동, `up`(\x1b[A) → 복귀(비파괴).
        **N번째 선택 = down ×(N-1) + Enter** (메뉴는 열릴 때 1번에 커서).
  - [x] 훅 `ITERM_SESSION_ID` → `--from-last-hook` **자동 타겟 end-to-end 성공**:
        훅 기록(`w0t1p0:UUID`)만으로 세션 자동 해석 → down/up 주입 → 커서 이동 확인.
        수동 세션 ID 입력 0회.
  - 비고: 마지막 Enter '커밋'은 대상 claude 가 실제 작업을 시작하므로 시연 보류(메커니즘은 증명됨).

### 결론: PoC 단계 통과 ✅ — 아키텍처 실현 가능성 입증됨

훅이 질문/선택지/세션ID 를 잡고 → 그 세션 UUID 로 정확히 키를 주입해 답을 고르는
전 과정이 사용자 머신에서 실증됨. 이제 이걸 상시 동작하는 서비스로 엮으면 됨.

## 다음 단계 (구현)

- [ ] **로컬 브릿지 서버**
  - dump-hook.sh 를 실제 브릿지로 교체: 훅이 질문/선택지/ITERM_SESSION_ID 를 서버로 POST
  - 서버가 보류 중인 질문 상태 보관 + 스트림덱으로 push (WebSocket)
  - 스트림덱 버튼 콜백 → 서버가 `inject-keys.py` 로직으로 해당 세션에 down×(N-1)+Enter 주입
  - iTerm2 Python API 연결 상시 유지(서버가 한 connection 으로 모든 세션 제어)
- [ ] **스트림덱 커스텀 플러그인**
  - 전용 프로파일/버튼에 질문·선택지 라벨 표시, 누르면 서버로 답 인덱스 전송

## scripts

- `dump-hook.sh` — PreToolUse(AskUserQuestion) 훅 덤프 (PoC 1)
- `list-sessions.py` — 열린 모든 창/탭/세션 + 고유 session_id 나열, 중복 판정
- `inject-keys.py` — 특정 세션 UUID 에 키 시퀀스 주입 (`--session` 또는 `--from-last-hook`)
- `read-screen.py` — 각 세션 화면 덤프 (주입 결과 교차확인용)

## 검증 발견 (2026-06-02)

- **훅/선택지 파이프라인은 호스트 무관하게 동작**한다. Desktop 앱 세션에서도 정상 발화·기록됨.
- **`ITERM_SESSION_ID` 가 `<none>` 으로 찍힌 이유**: 검증 세션이 iTerm2 가 아니라
  **Claude Desktop 앱**(`__CFBundleIdentifier = com.anthropic.claudefordesktop`)에서 실행됐기 때문.
  iTerm2 세션 자체가 없으니 환경변수도 없는 게 정상.
- → **검증 세션(Desktop 앱)과 실제 타겟(iTerm2 CLI)은 다른 환경**임을 유의.
  사용자는 제어 대상 클로드를 **iTerm2 CLI(`claude`)** 에서 실행한다.
- 환경: iTerm2 설치됨(`/Applications/iTerm.app`), `iterm2` 파이썬 모듈은 미설치(PoC 2에서 `pip install iterm2`).
- stdin 의 `session_id`/`cwd` 로도 세션 매칭이 가능하므로, `ITERM_SESSION_ID` 가 비어도
  iTerm2 Python API 로 세션을 역추적하는 폴백 경로가 존재함.

### 다중 창/탭 세션 구분 (확인 완료)

질문: iTerm2 창이 여러 개 + 한 창에 탭 여러 개여도 어느 세션인지 구분되는가? → **된다.**

- `ITERM_SESSION_ID` 형식 = **`wXtYpZ:UUID`**
  - `wXtYpZ` = 창/탭/패인 **위치 인덱스** → 닫았다 열면 **재사용됨**(이슈 #2269). 식별키로 쓰면 안 됨.
  - `:` 뒤 **UUID** = iTerm2 Python API 의 `session.session_id`, "globally unique identifier".
    창/탭/분할패인 **하나당 하나, 충돌 없음** → 이게 진짜 식별키.
- 타겟팅: 훅이 받은 `ITERM_SESSION_ID` 의 ':' 뒤 UUID 저장 →
  스트림덱이 `app.get_session_by_id(UUID)` 로 **정확히 그 세션만** 지목 →
  `session.async_send_text("\x1b[B...\r")` 로 방향키+Enter 주입.
- `async_send_text` 는 **포커스와 무관**하게 해당 세션 객체로 직접 전송 →
  백그라운드 탭의 질문도 **탭 전환 없이** 답변 가능.
- 확인 스크립트: `scripts/list-sessions.py` — 열린 모든 창/탭/세션과 고유 ID 나열, 중복 여부 판정.
  - 사전조건: iTerm2 **Settings > General > Magic > Enable Python API** 체크 + `pip install iterm2`(설치 완료).
  - 현재 상태: 모듈 설치됨(v2.19), 스크립트 정상 동작 확인. **API 옵션이 꺼져 있어** 실연결만 대기 중.

## PoC 1 실행 방법

1. **이 폴더에서 새 클로드코드 세션을 연다** (iTerm2 안에서):
   ```bash
   cd /Users/shinsanghoon/workspace/streamdeck-claude-bridge
   claude
   ```
2. 새 세션에서 `.claude/settings.json` 의 훅을 로드할지 묻거나, `/hooks` 로 확인.
3. 클로드가 **AskUserQuestion 을 쓰도록 유도**한다. 예:
   > "내 프로젝트 구조에 대해 너가 결정하기 애매한 선택지가 있으면 질문해줘"
   같은 식으로 클로드가 선택지를 제시하게 만든다.
4. 질문이 뜨면 `logs/hook-events.log` 와 `logs/hook-events.jsonl` 확인:
   ```bash
   cat logs/hook-events.log
   ```

## 판정 기준

- `hook-events.log` 에 항목이 생기면 → **훅 발화 성공**
- 그 안에 `Q: ...` / `options: A | B | C` 가 보이면 → **선택지 수신 성공** ✅
- `ITERM_SESSION_ID = ...` 에 값이 있으면 → **세션 타겟팅 가능** ✅
- 아무것도 안 생기면 → PreToolUse 가 AskUserQuestion 에 발화하지 않는 환경 →
  대안(Notification 훅 / transcript 폴링) 검토 필요
