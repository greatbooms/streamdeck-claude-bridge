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

- [x] **로컬 브릿지 서버** (구현 완료 → `bridge/`, 아래 "브릿지 서버 실행" 참고)
  - 훅(`.claude/hooks/on-question.sh`, `on-resolved.sh`)이 질문/선택지/ITERM_SESSION_ID 를 서버로 POST
  - 서버가 보류 질문 상태 보관 + WebSocket 으로 클라이언트에 push
  - 버튼 콜백 → 서버가 해당 세션에 down×(N-1)+Enter 주입 (단일선택), multiSelect 는 알림 전용
  - iTerm2 Python API 연결 상시 유지(전용 스레드, 한 connection 으로 모든 세션 제어)
- [x] **스트림덱 커스텀 플러그인** (구현 완료 → `streamdeck-plugin/`, 아래 "스트림덱 플러그인" 참고)
  - TS + `@elgato/streamdeck` SDK. 질문 오면 "Claude Answers" 프로파일로 자동 전환 →
    버튼으로 답 → 직전 프로파일 복귀. 브릿지 WS 프로토콜 그대로 소비, 19개 단위 테스트.
  - 남은 수동 단계: SD 앱에서 "Claude Answers" 프로파일을 만들어 export(`.streamDeckProfile`)하고
    매니페스트 `Profiles` 에 선언해야 자동 전환이 실제로 동작함(SDK 제약).

## 브릿지 서버 실행

```bash
python3 -m pip install -e ".[dev]"   # 최초 1회 (의존성 + 패키지)
python3 -m bridge                     # http://localhost:8787 (env BRIDGE_PORT 로 변경 가능)
open http://localhost:8787/           # 브라우저 테스트 클라이언트
```

사전조건: iTerm2 > Settings > General > Magic > **Enable Python API**.

자동 시작(로그인 시 + 죽으면 재시작): `bash scripts/install-launchd.sh`
(해제: `launchctl unload ~/Library/LaunchAgents/com.streamdeck-claude-bridge.plist`)

설계/계획 문서: [docs/superpowers/specs/2026-06-02-bridge-server-design.md](docs/superpowers/specs/2026-06-02-bridge-server-design.md),
[docs/superpowers/plans/2026-06-02-bridge-server.md](docs/superpowers/plans/2026-06-02-bridge-server.md).

### 수동 e2e 체크리스트
1. 브릿지 기동 + 브라우저로 테스트 클라이언트 열기.
2. iTerm2 에서 이 폴더로 `claude` 실행(훅 로드 승인).
3. claude 가 **단일선택** AskUserQuestion 을 내게 유도.
4. 테스트 클라이언트에 질문 카드 + 선택지 버튼이 뜨는지 확인.
5. 버튼 N 클릭 → iTerm2 메뉴에서 N 번째가 선택되고 claude 가 진행되는지 확인.
6. **multiSelect** 질문은 "터미널에서 직접 선택" 안내만 뜨는지 확인.

## 스트림덱 플러그인

빌드 & 설치:
```bash
npm i -g @elgato/cli           # 최초 1회
cd streamdeck-plugin && npm install && npm run build
npx @elgato/cli link com.shinsanghoon.claude-bridge.sdPlugin
npx @elgato/cli restart com.shinsanghoon.claude-bridge
```

구성:
1. Stream Deck 앱에서 "Claude Answers" 프로파일을 만든다.
2. 버튼들에 **Answer** 액션을 올리고, 각 버튼의 Property Inspector 에서 `선택지 번호`를 1,2,3… 으로 설정.
3. 한 버튼에 **Cancel** 액션 배치.

동작: 브릿지(`python -m bridge`)가 떠 있는 상태에서 클로드 질문이 오면 스트림덱이
"Claude Answers" 프로파일로 자동 전환되고, 버튼으로 답하면 해당 iTerm2 세션에 주입된 뒤
원래 프로파일로 복귀한다. multiSelect 질문은 알림 전용(터미널에서 직접 선택).

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
