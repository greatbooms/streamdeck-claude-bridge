# 브릿지 서버 설계 (streamdeck-claude-bridge)

작성일: 2026-06-02
상태: 설계 승인 대기 → 구현 계획(writing-plans)으로 이행 예정

## 1. 목적과 배경

클로드코드(iTerm2 CLI)가 `AskUserQuestion` 으로 질문할 때, **사용자가 그 사실을
즉시 알아차리고(1순위), 쉬운 질문은 스트림덱/클라이언트 버튼으로 바로 답(2순위)** 할 수
있게 하는 로컬 브릿지 서버.

PoC 1·2 에서 다음이 사용자 머신에서 실증됨 (별도 검증 완료):
- `PreToolUse(AskUserQuestion)` 훅이 질문/선택지와 함께 발화
- 훅 env `ITERM_SESSION_ID = wXtYpZ:UUID`, 이 UUID == iTerm2 Python API `session.session_id`
- `app.get_session_by_id(UUID).async_send_text(...)` 로 **포커스 무관·오발사 없이** 그 세션에만 키 주입
- AskUserQuestion 메뉴: 열릴 때 1번에 커서, **N번째 선택 = `↓`×(N-1) + `Enter`**
  (`↓`=`\x1b[B`, `↑`=`\x1b[A`, `Enter`=`\r`, `Esc`=`\x1b`)

본 스펙의 범위는 **브릿지 서버 + 브라우저 테스트 클라이언트**.
전용 스트림덱 플러그인은 별도 하위 프로젝트(WS 프로토콜을 플러그인 호환되게 설계).

## 2. 언어 / 런타임 결정

- **순수 Python** (브릿지 전체 단일 프로세스). iTerm2 제어 바인딩이 Python 전용이므로,
  검증된 코드를 그대로 재사용하고 iTerm2 연결을 상시 유지하기에 가장 단순·견고.
- 웹 프레임워크: **aiohttp** (HTTP + WebSocket + 정적 서빙을 한 프로세스에서, 이벤트 루프를
  우리가 소유). FastAPI/uvicorn 은 자체 루프 관리로 iTerm2 상시 연결과 동거가 까다로워 제외.
- NestJS/TS 는 채택 안 함 (이 소형 데몬엔 과하고, iTerm2 Python 결합과 충돌).

## 3. 아키텍처

세 조각 (훅 외 전부 단일 Python asyncio 프로세스):

```
claude(iTerm2)가 AskUserQuestion 호출
  │
  ├─ PreToolUse 훅  ──POST /hook/question──▶ 브릿지
  │     (ITERM_SESSION_ID[env] + 질문/선택지[stdin] 합쳐 전송)
  │
  │   브릿지: pending[UUID] 저장 → WS 브로드캐스트
  │     │
  │     ▼
  │   클라이언트(테스트 페이지/추후 스트림덱)
  │     - 단일선택: 선택지 버튼 표시
  │     - multiSelect: "질문 중" 알림 + 읽기전용 선택지
  │
  │   사용자가 N번 버튼 클릭 ──WS {answer,session,index}──▶ 브릿지
  │     │
  │     ▼
  │   injector: get_session_by_id(UUID).async_send_text("\x1b[B"×(N-1)+"\r")
  │     → iTerm2 메뉴에서 N번 선택 → claude 진행
  │
  └─ PostToolUse 훅 ──POST /hook/resolved──▶ 브릿지: pending 제거 → 브로드캐스트
```

### 3.1 iTerm2 ↔ aiohttp 통합 (결정: 방식 B)

iTerm2 연결은 **자기 전용 스레드에서 `iterm2.run_forever`(라이브러리 공식 진입점)** 로
구동하고, aiohttp 는 메인 스레드/루프에서 구동. 두 루프 사이는
`asyncio.run_coroutine_threadsafe(injector.select(...), iterm_loop)` 로 연결.

- 이유: iterm2 라이브러리를 설계된 방식 그대로 사용(루프 소유권 충돌 회피), 두 관심사 격리.
- 비용: 스레드 1개 + 스레드세이프 제출 배관. (단일 공유 루프 방식 A 는 통합 취약성으로 제외.)
- injector 스레드가 iTerm2 `app` 모델을 보유·갱신하고, 메인 루프는 제출만 한다.

## 4. 구성 요소 (모듈)

| 파일 | 책임 | 주요 인터페이스 |
|---|---|---|
| `bridge/__main__.py` | 진입점, 설정 로드 | `python -m bridge` (env: `BRIDGE_PORT`=8787) |
| `bridge/server.py` | aiohttp 앱·라우트·기동/종료, injector 스레드 시작 | `make_app()`, `run()` |
| `bridge/state.py` | 보류 질문 저장소 | `PendingStore.add(q)`, `.resolve(uuid)`, `.get(uuid)`, `.list()` |
| `bridge/models.py` | 데이터 모델 | `Question`, `Option` (dataclass) |
| `bridge/injector.py` | iTerm2 연결·키 주입 | `key_sequence(index)->str`(순수), `async select(uuid,index)`, `async cancel(uuid)`, 재연결 |
| `bridge/hooks_api.py` | 훅 HTTP 핸들러 | `POST /hook/question`, `POST /hook/resolved` |
| `bridge/ws.py` | WS 핸들러·클라 레지스트리·브로드캐스트 | `GET /ws`, `broadcast(msg)` |
| `webclient/index.html`, `webclient/app.js` | 테스트 클라이언트 | WS 연결, 질문 렌더, 답/취소 전송 |
| `.claude/hooks/on-question.sh` | PreToolUse 훅(curl) | env+stdin → `POST /hook/question` |
| `.claude/hooks/on-resolved.sh` | PostToolUse 훅(curl) | → `POST /hook/resolved` |
| `.claude/settings.json` | 훅 등록 | PreToolUse/PostToolUse matcher=AskUserQuestion |

기존 `scripts/{list-sessions,inject-keys,read-screen}.py` 는 검증/디버그 도구로 유지.
`scripts/dump-hook.sh` 는 on-question.sh 로 대체(원하면 로깅 옵션 보존).

## 5. 데이터 모델 / 프로토콜

### 5.1 Question (내부 + WS 페이로드)
```jsonc
{
  "session": "C7181934-68D6-...",   // 정규화된 UUID (키)
  "claude_session_id": "21faf6...", // 참고용
  "header": "작업 선택",
  "question": "어떤 작업을 진행할까요?",
  "multiSelect": false,
  "options": [
    {"label": "코드 작성", "description": "..."},
    {"label": "버그 수정", "description": "..."}
  ]
}
```
- 세션 키 정규화: `iterm_session_id` 에 `:` 있으면 뒤쪽 UUID 사용, 없으면 원문.
- MVP 는 questions 배열의 **첫 질문만** 다룬다(다중질문 시퀀스는 §8 향후).

### 5.2 HTTP (훅 → 브릿지)
- `POST /hook/question`  body: `{ iterm_session_id, claude_session_id, questions:[...] }`
  → 첫 질문을 `PendingStore.add`, `question_added` 브로드캐스트. 200 즉시 반환.
- `POST /hook/resolved`  body: `{ iterm_session_id }`
  → `PendingStore.resolve`, `question_resolved` 브로드캐스트. 200.
- 훅은 `curl --max-time 2 ... || true`, 항상 `exit 0`.

### 5.3 WebSocket (브릿지 ↔ 클라이언트, `/ws`)
서버→클라:
- `{type:"sync", questions:[Question...]}`  — 연결 직후 현재 보류 전체
- `{type:"question_added", question:Question}`
- `{type:"question_resolved", session:"UUID"}`
- `{type:"error", session, message}`

클라→서버:
- `{type:"answer", session:"UUID", index:N}`  (N: 1-based, 메뉴 번호와 동일)
- `{type:"cancel", session:"UUID"}`  → injector 가 `Esc` 주입

### 5.4 키 시퀀스 (순수 함수, 단위테스트 대상)
```
key_sequence(index) = "\x1b[B" * (index - 1) + "\r"   # index >= 1
```

## 6. 질문 유형별 동작

- **단일선택(multiSelect=false)**: 클라이언트가 선택지 버튼 렌더. 클릭 → `answer` →
  injector 가 `↓`×(N-1)+Enter 주입. 주입 직후 즉시 resolved 처리·브로드캐스트(이중주입 차단).
- **multiSelect=true**: **알림 전용.** 클라이언트가 "🔔 Claude이 질문 중 (다중선택)" 배너 +
  선택지를 **읽기전용**으로 표시 + *"터미널에서 직접 선택하세요"* 안내. **주입하지 않음.**
  (Space 토글 기반 자동 다중선택은 §8 향후 과제.)
- 두 유형 모두 PostToolUse(또는 사용자가 터미널서 직접 답함) 시 `/hook/resolved` 로 정리.

## 7. 에러 처리 (1원칙: claude 를 절대 막지 않는다)

- 브릿지 다운 + 훅 발화 → curl `--max-time 2` + `exit 0` → claude 정상(미러링만 누락).
- 닫힌/모르는 세션에 answer → `get_session_by_id`=None → 클라에 `error` + 해당 pending 정리.
- iTerm2 미실행/Python API 비활성 → 브릿지는 경고 로그 + 백그라운드 재연결(지수 백오프);
  HTTP/WS 는 계속 서빙(훅은 에러 안 남). answer 는 연결 복구 전까지 graceful 실패.
- WS 클라 끊김 → 레지스트리에서 제거. 재연결 시 `sync` 로 현재 보류 재전송.
- 중복/연타 클릭 → 주입 즉시 resolved·브로드캐스트, 이미 resolved 인 세션 answer 는 무시.

## 8. 범위 / 비목표 (MVP)

포함:
- 단일선택 질문: 알림 + 버튼 답변 주입
- multiSelect 질문: 알림 전용(읽기전용 선택지)
- 취소(Esc) 주입
- 브라우저 테스트 클라이언트
- `python -m bridge` 수동 실행(기본 포트 8787, localhost 바인드)

비목표(문서화된 향후):
- multiSelect 자동 선택(Space 토글 조합 주입)
- AskUserQuestion 당 다중질문 시퀀스 대응
- 전용 스트림덱 플러그인(다음 하위 프로젝트; WS 프로토콜은 호환되게 설계)
- 인증/원격 접근(현재 개인용 localhost 전용)
- launchd 자동 시작(선택적 후속)

## 9. 테스트 전략

- **단위(빠름·순수)**: `key_sequence(index)`; 세션ID 정규화(`wXtYpZ:` 제거);
  `PendingStore` add/resolve/list; questions 배열→첫 질문 파싱.
- **통합(aiohttp 테스트 클라 + injector 목)**:
  - `POST /hook/question` → `question_added` 브로드캐스트 형태/내용 검증
  - WS `answer` → `injector.select(uuid, index)` 호출 인자 검증
  - `POST /hook/resolved` → `question_resolved` 브로드캐스트
  - multiSelect 질문 → 주입 호출 없음(알림만) 검증
- **수동 e2e**(README 체크리스트 1개): iTerm2 에서 이 폴더로 claude 실행 →
  단일선택 질문 유도 → 테스트 클라이언트 버튼 클릭 → 메뉴에서 해당 선택지 선택됨 확인.

## 10. 실행 / 사용

```bash
# 1) 브릿지 기동
python -m bridge                      # http://localhost:8787

# 2) 테스트 클라이언트 열기
open http://localhost:8787/           # 보류 질문이 카드로 표시됨

# 3) iTerm2 에서 이 폴더로 claude 실행 → 질문 발생 시 클라이언트에 미러링
```
의존성: `aiohttp`, `iterm2` (`requirements.txt` 로 고정). 사전조건: iTerm2 Python API 활성화.
