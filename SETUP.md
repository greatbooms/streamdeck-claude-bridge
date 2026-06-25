# 셋업 가이드 (새 컴퓨터에서 처음부터)

이 문서는 repo 를 새로 받은 macOS 기기에서 streamdeck-claude-bridge 를 끝까지 동작시키는 방법이다.
전체 그림: **어느 프로젝트의 claude 질문 또는 Codex CLI 권한 요청이든 → (글로벌 훅) → 브릿지 →
스트림덱 플러그인 → "Claude Bridge" 또는 "Codex Bridge" 프로파일 자동 전환 + 버튼 →
누르면 iTerm2 세션에 답/승인 주입 → 평소 프로파일 복귀.**

아래에서 `$REPO` 는 이 repo 를 클론한 절대경로다. 먼저 정해두자:

```bash
REPO="$HOME/workspace/streamdeck-claude-bridge"   # 본인 클론 경로로
```

---

## 0. 사전 준비물

- macOS + **iTerm2** + **Elgato Stream Deck 앱** + 스트림덱 기기
- **Python 3.10+**, **Node 18+** (플러그인 빌드용. 플러그인 런타임은 SD 번들 Node 20)
- iTerm2: **Settings → General → Magic → Enable Python API** 체크
- 제어 대상 claude/Codex 는 **iTerm2 CLI(`claude`, `codex`)** 에서 실행해야 함
  (Desktop/IDE 앱은 이 iTerm2 키 주입 경로 범위 밖)

---

## 1. 브릿지 서버 (Python)

```bash
cd "$REPO"
python3 -m pip install -e ".[dev]"     # 의존성 + 패키지(editable) 설치
python3 -m pytest -q                    # (선택) 테스트 통과 확인
```

자동 시작 등록 (로그인 시 시작 + 죽으면 재시작):
```bash
bash scripts/install-launchd.sh
```
- 이 스크립트는 **현재 기기의 python3 경로와 repo 경로를 자동 감지**해 LaunchAgent 를 만든다.
- 수동 실행으로 테스트하려면: `python3 -m bridge` (기본 포트 8787).
- 해제: `launchctl unload ~/Library/LaunchAgents/com.streamdeck-claude-bridge.plist`
- 로그: `$REPO/logs/bridge.{out,err}.log`

---

## 2. 글로벌 훅 (모든 프로젝트의 claude 미러링)

`~/.claude/settings.json` 의 `hooks` 에 아래를 추가한다 (**경로를 본인 `$REPO` 로 치환**).
이미 다른 설정이 있으면 `hooks` 키만 병합한다.

```json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "REPO경로/.claude/hooks/on-question.sh", "timeout": 10 }] }
    ],
    "PostToolUse": [
      { "matcher": "AskUserQuestion",
        "hooks": [{ "type": "command", "command": "REPO경로/.claude/hooks/on-resolved.sh", "timeout": 10 }] }
    ]
  }
}
```
- `REPO경로` 예: `/Users/이름/workspace/streamdeck-claude-bridge`
- 훅 스크립트 실행권한 확인: `chmod +x "$REPO"/.claude/hooks/*.sh`
- **적용은 새 claude 세션부터.** 이미 떠 있는 세션은 재시작해야 훅이 로드된다.
- 프로젝트-로컬 훅(`$REPO/.claude/settings.json`)만 쓰면 그 폴더 세션만 미러링됨 — 전 프로젝트로 쓰려면 글로벌 필수.

### 2-1. Codex 글로벌 훅 (모든 프로젝트의 Codex 권한 요청 미러링)

`~/.codex/hooks.json` 의 `hooks` 에 아래를 추가한다 (**경로를 본인 `$REPO` 로 치환**).
Codex는 새 세션에서 `/hooks` 로 새 hook을 review/trust 해야 실행한다.

```json
{
  "hooks": {
    "PermissionRequest": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "REPO경로/.codex/hooks/on-permission-request.sh",
            "timeout": 10,
            "statusMessage": "Mirroring Codex permission"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "REPO경로/.codex/hooks/on-resolved.sh", "timeout": 10 }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "REPO경로/.codex/hooks/on-resolved.sh", "timeout": 10 }
        ]
      }
    ]
  }
}
```

- 훅 스크립트 실행권한 확인: `chmod +x "$REPO"/.codex/hooks/*.sh`
- 적용은 **새 codex 세션부터**.
- `PermissionRequest` 는 Stream Deck에 승인 요청을 표시한다.
- `PostToolUse`/`Stop` cleanup은 사용자가 터미널에서 직접 답한 경우 stale 표시를 줄이기 위한 보조 훅이다.

---

## 3. 스트림덱 플러그인 (TypeScript)

```bash
npm i -g @elgato/cli                    # 최초 1회
cd "$REPO/streamdeck-plugin"
npm install
npm run build                           # src → *.sdPlugin/bin/plugin.js
npx @elgato/cli dev                     # 개발자 모드 ON (링크된 플러그인 로드에 필요)
npx @elgato/cli link com.shinsanghoon.claude-bridge.sdPlugin
```
그다음 **Stream Deck 앱을 완전히 종료 후 재실행** (새 플러그인 등록 + 번들 프로파일 임포트):
```bash
osascript -e 'tell application id "com.elgato.StreamDeck" to quit'; sleep 3; open -a "Elgato Stream Deck"
```
- 앱이 **"Claude Bridge"**, **"Codex Bridge"** 프로파일 설치를 물으면 둘 다 **"프로필 설치"**.
- 플러그인은 `$REPO` 경로에 **심볼릭 링크**된다 → **repo 를 옮기거나 지우면 깨진다.**

### 단위 테스트 (선택)
```bash
cd "$REPO/streamdeck-plugin" && npx vitest run
```

---

## 4. 사용

1. 평소엔 **본인 작업 프로파일**에 둔다 (질문 끝나면 그 프로파일로 복귀하므로).
2. iTerm2 에서 아무 프로젝트나 `claude` 실행 (글로벌 훅이 잡는다).
3. claude 가 AskUserQuestion 하면 → 스트림덱이 **Claude Bridge** 로 자동 전환 + 버튼에 선택지.
4. Codex CLI 가 권한 요청을 하면 → 스트림덱이 **Codex Bridge** 로 자동 전환 + 승인 버튼 표시.
5. 버튼 누르면 → 그 iTerm2 세션 메뉴에 주입 → 답/승인 끝나면 평소 프로파일 복귀.
6. multiSelect 질문은 알림 전용(터미널에서 직접 선택).

브라우저 테스트 클라이언트(플러그인 없이 동작 확인): `open http://localhost:8787/`

---

## 5. Dev Launcher 프로파일

IntelliJ 프로젝트 실행용 개발 프로파일은 선택 기능이다.

1. `intellij-plugin/build/distributions/`에서 IntelliJ companion plugin zip을 설치한다.
2. Stream Deck 앱에서 번들된 **Dev Launcher** 프로파일을 설치한다.
3. 필요한 경우 `~/Library/Application Support/streamdeck-claude-bridge/launcher.json` 파일로 이름/favorites를 보정한다.

기본 동작:

- IntelliJ에 열려 있는 프로젝트를 자동으로 첫 화면에 표시한다.
- 프로젝트 루트에 `gradlew`, `build.gradle*`, `settings.gradle*`가 있으면 Gradle command를 표시한다.
- 프로젝트 루트에 `package.json`이 있으면 npm scripts를 표시한다.
- Gradle command는 IntelliJ에 열려 있으면 IntelliJ Gradle Run으로 실행하고, 실패하면 iTerm2 fallback으로 실행한다.
- npm command는 같은 이름의 IntelliJ Run Configuration이 있으면 IntelliJ에서 실행하고, 없으면 iTerm2 fallback으로 `npm run <script>`를 실행한다.

`launcher.json` 예시:

```json
{
  "projects": [
    {
      "name": "API",
      "path": "/Users/eric/workspace/api-server",
      "gradleCommand": "./gradlew",
      "favorites": ["bootRun", "test", "build"]
    },
    {
      "name": "Web",
      "path": "/Users/eric/workspace/web",
      "gradleCommand": "./gradlew",
      "favorites": []
    }
  ]
}
```

- `launcher.json`에 없어도 IntelliJ에 열린 프로젝트는 표시된다.
- `favorites`는 Gradle command를 우선 노출할 때 쓴다.
- npm scripts는 `start:dev`, `dev`, `start`, `test`, `build`, `lint` 순으로 우선 표시된다.

---

## 6. 다른 기기로 옮길 때 주의 (포터빌리티)

- **경로 의존:** 글로벌 훅 경로, launchd plist, 플러그인 링크 모두 그 기기의 `$REPO` 절대경로를 쓴다.
  새 기기에선 §1 의 `install-launchd.sh` 재실행 + §2 의 훅 경로를 새 경로로 다시 적어야 한다.
- **스트림덱 기기 모델 의존:** 번들 `Claude Bridge.streamDeckProfile` / `Codex Bridge.streamDeckProfile`
  은 **5×3 표준 Stream Deck(DeviceType 0)**
  기준으로 만들어졌다. **다른 모델/크기(XL, Mini, +, Mobile 등)** 면 그 프로파일이 안 맞을 수 있다.
  그 경우: SD 앱에서 프로파일을 새로 구성(1행 Logo×5, 2행 Answer 각 `선택지 번호` 1..N, Cancel) →
  export 해서 `streamdeck-plugin/.../*.streamDeckProfile` 교체 + 매니페스트 `Profiles[].DeviceType`
  를 해당 타입으로 수정 → 재빌드/재링크.
- **개발자 모드 vs 정식 패키지:** 위는 `link`(개발자 모드) 방식이다. repo 와 무관하게 설치하려면
  `cd streamdeck-plugin && npx @elgato/cli pack com.shinsanghoon.claude-bridge.sdPlugin` 로
  `.streamDeckPlugin` 을 만들어 더블클릭 설치하면 된다(이 경우 개발자 모드/링크 불필요).

---

## 7. 빠른 점검 / 트러블슈팅

```bash
# 브릿지 살아있나
lsof -ti tcp:8787 && echo up || echo down
# 브릿지에 질문이 도달하나 (claude 에서 질문 유도 후)
python3 - <<'PY'
import asyncio,aiohttp,json
async def m():
 async with aiohttp.ClientSession() as s:
  async with s.ws_connect("http://127.0.0.1:8787/ws") as ws:
   print((await ws.receive()).data)
asyncio.run(m())
PY
# 플러그인 로그 (전환 성공/실패)
tail -20 "$REPO"/streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/logs/*.log | grep -i profile
```

증상별:
- **스트림덱에 안 뜸** → ① 브릿지 down? ② 질문난 claude/codex 가 글로벌 훅 적용된 **새** 세션인가? ③ Codex는 `/hooks` 에서 trust 했나? ④ 플러그인 로그 `profile enter`.
- **전환은 되는데 복귀 안 됨** → 질문 올 때 **평소 프로파일에 있었는지** 확인(복귀는 "직전 프로파일"로).
- **`switchToProfile timed out`** → 번들 프로파일 미설치(SD 앱 재실행 후 "프로필 설치") 또는 기기 타입 불일치(§6).
- **버튼 라벨은 뜨는데 안 골라짐** → injector 가 방향키/Enter 를 개별 전송하는지(이미 반영됨), 대상 세션 UUID 일치.
