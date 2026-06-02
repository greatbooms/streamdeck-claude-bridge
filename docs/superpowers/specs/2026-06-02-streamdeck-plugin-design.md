# 스트림덱 플러그인 설계 (streamdeck-claude-bridge)

작성일: 2026-06-02
상태: 설계 승인 → 구현 계획(writing-plans)으로 이행 예정
선행: 브릿지 서버(`bridge/`, `main` 브랜치, 33 테스트 통과) — WS 프로토콜 재사용

## 1. 목적

브릿지 서버가 미러링하는 클로드 AskUserQuestion 질문을, **실제 Elgato Stream Deck 버튼**에서
알아차리고 답할 수 있게 하는 커스텀 플러그인. 핵심 UX:

- 평소엔 사용자가 구성한 페이지를 본다.
- **질문이 오면 전용 프로파일로 자동 전환**되어 선택지가 버튼에 뜬다.
- 버튼을 누르면 해당 답이 iTerm2 세션에 주입된다(브릿지 경유).
- **응답이 끝나면 사용자가 원래 보던 페이지(프로파일)로 자동 복귀**한다.

본 스펙 범위 = 플러그인. 브릿지는 변경하지 않는다(기존 WS 프로토콜 그대로 소비).

## 2. 기술 스택 / 배치

- **TypeScript + `@elgato/streamdeck` SDK** (Node.js 런타임 플러그인). Stream Deck 앱 v7.4.2 확인됨.
- 빌드/링크: 공식 `@elgato/cli`(`streamdeck`). `streamdeck link`로 산출물을 SD Plugins 디렉터리에 심볼릭 연결, `streamdeck restart`로 리로드.
- 배치: 같은 repo의 **`streamdeck-plugin/`** 하위 디렉터리(모노레포). 자체 `package.json`/`tsconfig.json`.
- 테스트: **vitest**(순수 로직 단위). 액션/프로파일 전환은 실기기 수동 e2e.

## 3. 아키텍처 / 동작 흐름

```
[평소] 사용자 구성 프로파일 표시
   │
브릿지 WS question_added ──▶ 플러그인
   │   - activeQuestion = 최신 질문
   │   - 이전에 활성 질문이 없었으면: switchToProfile(device, "Claude Answers")
   │   - 각 답변 버튼 제목 = activeQuestion.options[optionIndex-1].label (없으면 공백)
   ▼
[전용 프로파일] 버튼1=선택지1, 버튼2=선택지2, … + 취소 버튼
   │
사용자가 버튼 i 누름 ──answer{session,index:i}──▶ 브릿지 ──▶ iTerm2 주입
   │
브릿지 WS question_resolved ──▶ 플러그인
   │   - pending 에서 제거, activeQuestion = 남은 최신(없으면 null)
   │   - activeQuestion 이 null 이 되면: switchToProfile(device)  ← 직전 프로파일 복귀
   ▼
[복귀] 사용자가 원래 보던 페이지
```

핵심: **활성 질문이 "없음 → 있음"으로 바뀔 때 전용 프로파일로 전환하고, "있음 → 없음"으로
바뀔 때 직전 프로파일로 복귀**한다. 질문이 다른 질문으로 교체될 때는 전환 없이 제목만 갱신.

## 4. 컴포넌트 (모듈)

`streamdeck-plugin/src/`:

| 파일 | 책임 | 인터페이스 |
|---|---|---|
| `types.ts` | 공유 타입 | `Question`, `Option`, `ServerMsg`, `ClientMsg` |
| `bridge-client.ts` | 브릿지 WS 연결·재연결·메시지 처리·송신 | `BridgeClient(url, wsFactory?)`: `start()`, `answer(session,index)`, `cancel(session)`, `on("change", cb)`, `getState()` |
| `question-state.ts` | 보류 질문 보관 + 활성 질문 계산 | `QuestionState`: `applySync/applyAdded/applyResolved`, `active(): Question\|null`, `labelFor(index): string\|null` |
| `answer-action.ts` | 답변 버튼 액션(`SingletonAction`) | 설정 `{optionIndex:number}`; `onWillAppear`/`onKeyDown`; 제목 갱신 |
| `cancel-action.ts` | 취소 버튼 액션 | `onKeyDown` → `cancel(activeSession)` |
| `plugin.ts` | 엔트리: 클라이언트·액션·프로파일 전환 오케스트레이션 | — |
| `profile-switcher.ts` | 프로파일 전환 캡슐화(테스트 위해 SDK 의존 격리) | `ProfileSwitcher(sd)`: `enter()`, `leave()` (idempotent) |

플러그인 패키지 루트:
- `manifest.json` — UUID `com.shinsanghoon.claude-bridge`, 액션 2개(`.answer`, `.cancel`),
  Node.js 런타임, macOS, `Software.MinimumVersion` 6.5, 번들 `Profiles` 항목.
- `Claude Answers.streamDeckProfile` — 답변 버튼들을 **`optionIndex`=1..6 으로 미리 설정**해 둠
  + 취소 버튼. → 사용자는 프로파일만 설치, **Property Inspector 불필요**.

## 5. 데이터 / 프로토콜 (브릿지 WS 재사용)

수신(서버→플러그인):
- `{type:"sync", questions:[Question...]}` — 연결 직후
- `{type:"question_added", question:Question}`
- `{type:"question_resolved", session}`
- `{type:"error", session, message}`

송신(플러그인→서버):
- `{type:"answer", session, index}` (index 1-based)
- `{type:"cancel", session}`

`Question` = `{session, header, question, multiSelect, claude_session_id, options:[{label,description}]}`.

## 6. 활성 질문 / 버튼 매핑 로직 (`question-state.ts`, 순수)

- `pending`: `Map<session, Question>`, 삽입 순서 유지. `applyAdded` 는 set(맨 뒤로), `applyResolved` 는 delete.
- `active()`: pending 의 **마지막(가장 최근)** 항목, 없으면 null.
- `labelFor(index)`: `active()?.options[index-1]?.label ?? null`.
- `isMultiSelect()`: `active()?.multiSelect ?? false`.

## 7. 동작 세부

- **답변 버튼(`answer-action`)**: `onWillAppear` 와 상태 변경 시 제목 = `labelFor(optionIndex)`(없으면 공백).
  `onKeyDown`: 활성 질문이 단일선택이면 `client.answer(activeSession, optionIndex)`; multiSelect 면
  `showAlert()`(주입 안 함).
- **취소 버튼(`cancel-action`)**: `onKeyDown` → `client.cancel(activeSession)`. (활성 질문 없으면 무시)
- **프로파일 전환(`profile-switcher` + `plugin`)**: 상태 변경 콜백에서
  `active` 가 null→비null 이면 `enter()`(switchToProfile("Claude Answers")),
  비null→null 이면 `leave()`(switchToProfile() 인자 없이 → 직전 복귀). 두 메서드는 **idempotent**.
- **multiSelect**: 전환은 하되 버튼은 라벨 표시 + 누르면 알림만. 취소 버튼으로 복귀 가능.

## 8. 에러 처리 / 엣지

- **브릿지 연결 실패/끊김**: `bridge-client` 가 지수 백오프 재연결. 연결 끊긴 동안 활성 질문은
  비우고(있었다면 `leave()`), 버튼 제목은 공백 또는 "연결 끊김". claude 동작에는 영향 없음(플러그인은 소비자).
- **전환 중복**: `enter()`/`leave()` 는 현재 상태를 기억해 중복 호출을 무시(idempotent) → 깜빡임 방지.
- **다중 질문**: 활성=최신. 하나 해소되면 남은 최신으로 제목 갱신(전환 없음), 전부 해소되면 복귀.
- **답 주입 실패(error 메시지)**: 버튼에 `showAlert()` 표시, 질문은 유지(브릿지가 resolve 안 했으므로).
- **여러 디바이스**: MVP 는 연결된 모든 디바이스에 동일 전환 적용(또는 첫 디바이스). 단순화.

## 9. 테스트 전략

- **단위(vitest, 순수)**:
  - `question-state`: sync/added/resolved 적용 후 `active()`/`labelFor()`/`isMultiSelect()` 결과.
  - `bridge-client`: 가짜 WS 주입 → 수신 메시지별 상태 변화 + `change` 이벤트, `answer/cancel` 가
    올바른 JSON 송신, 끊김 시 재연결 스케줄.
- **수동 e2e(체크리스트)**: 실기기에서 브릿지+claude 단일선택 질문 → 전용 프로파일 자동 전환 →
  버튼 클릭 → iTerm2 에서 해당 선택지 선택 → **원래 프로파일로 복귀** 확인. multiSelect 는 알림만.

## 10. 빌드 / 설치 / 사용

```bash
npm i -g @elgato/cli                  # 최초 1회
cd streamdeck-plugin
npm install
npm run build                         # src → *.sdPlugin/bin/plugin.js (tsup/rollup)
streamdeck link com.shinsanghoon.claude-bridge.sdPlugin   # SD Plugins 에 심볼릭 연결
streamdeck restart com.shinsanghoon.claude-bridge
```
첫 실행 시 Stream Deck 이 "Claude Answers" 프로파일 설치를 물어보면 추가. 브릿지(`python -m bridge`)가
떠 있어야 함.

## 11. 범위 / 비목표 (MVP)

포함: 전용 프로파일 자동 전환+복귀 · 선택지당 버튼(번들 프로파일에 index 미리 배선) · 취소 버튼 ·
multiSelect 알림 전용 · 활성=최신 · 재연결 · 단위 테스트 + 수동 e2e.

비목표(향후): 커스텀 아이콘/이미지 · 다이얼(SD+) · Property Inspector · 큐 네비게이션 UI ·
멀티 디바이스 정교화 · 자동 배포/서명.

## 12. repo 정리

- `streamdeck-plugin/` 하위에 격리(자체 package.json/tsconfig).
- `.gitignore` 에 추가: `node_modules/`, `streamdeck-plugin/*.sdPlugin/bin/`(빌드 산출물),
  `*.egg-info/`(현재 추적 외로 떠 있는 파이썬 빌드 메타).
