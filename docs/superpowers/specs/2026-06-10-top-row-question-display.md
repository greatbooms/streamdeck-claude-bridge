# 상단 줄에 질문 본문 표시 (레이아웃 개편)

날짜: 2026-06-10

## 배경 / 문제

현재 Claude Bridge 프로필은 활성 질문의 **선택지(answer options)만** 보여주고,
정작 **질문 본문(`question`)은 화면 어디에도 표시되지 않는다**. 사용자가 어떤
질문에 답하는지 Stream Deck만 보고는 알기 어렵다.

기존 상단 줄 5칸은 `✻ CLAUDE CODE` 배너 조각(LogoAction)으로 채워져 있어,
정보량 없는 장식에 가까운 한 줄을 차지하고 있었다.

## 목표

상단 줄을 질문 본문 표시 용도로 재활용하고, 브랜드 로고는 한 칸으로 압축한다.

## 레이아웃 (Stream Deck MK.2, 5열 × 3행 / 좌표 = `column,row`)

```
Row0:  Q     Q     Q     Q     Q       ← 질문 본문을 가로로 이어서 표시
Row1:  A1    A2    A3    A4    ·       ← 선택지 1~4 (변경 없음)
Row2:  Cancel ·     ·     ·   [✻ CLAUDE CODE]
```

- 상단 5칸: 새 **Question 표시 액션**
- 중간 4칸: 기존 Answer 액션 (optionIndex 1~4) — 변경 없음
- 하단 좌측: 기존 Cancel — 변경 없음
- 하단 우측 `4,2`: LogoAction (배너 조각 → 단일 아이콘+이름 타일로 변경)

## 동작

### Question 표시 액션 (`com.shinsanghoon.claude-bridge.question`)

- 표시 전용. 눌러도 동작 없음.
- 각 키는 `onWillAppear`의 `coordinates.column`(0~4)으로 자기 칸 위치를 안다.
- 활성 질문의 **본문 `question`** 을 **단어 단위로 5칸에 균등 분배**한다:
  각 칸은 누적 글자 폭이 고르도록 단어 묶음을 받고, 칸 안에서만 줄바꿈한다.
  칸을 **왼→오로 읽으면 원문 단어 순서가 그대로 이어진다**.
- **각 칸은 완전한 단어만** 담으므로 키 경계에서 글자가 잘리지 않는다(읽기 우선).
- 칸 글자 크기 FS=30, 칸당 최대 3줄, 세로 가운데 정렬. 칸 안에서 넘치면 마지막 줄 끝에 `…`.
  (칸 폭보다 긴 단어 하나는 안전장치로 글자 단위 분할.)
- 활성 질문이 바뀌면 `refreshAll()`로 5칸을 모두 다시 그린다
  (현재 AnswerAction이 쓰는 방식과 동일하게 `plugin.ts`의 `client.onChange`에 연결).
- 활성 질문이 없으면 텍스트 없는 idle 배경만 렌더.

> 설계 변천(구현 중 합의): 처음엔 (a) 칸별 세로 채우기 → (b) 5칸을 가로지르는
> 연속 한 줄(translate 슬라이스)을 시도했으나, Stream Deck SVG 렌더러가 `textLength`를
> 무시해 5번째 칸이 비고 **키 물리적 틈에서 글자가 반쪽 잘려** 가독성이 나빴다.
> 최종적으로 **단어 단위 균등 분배**로 정착 — 5칸이 항상 채워지고 글자 잘림이 없다.

### LogoAction

- 기존: `column % 5` 로 배너 조각 1~5 선택.
- 변경: 위치와 무관하게 **고정된 `✻` 아이콘 + `CLAUDE CODE` 텍스트** 한 칸짜리
  SVG 타일을 렌더. PNG 배너 의존 제거.

## 모듈 구성

- `src/question-image.ts` (신규): 본문 문자열 + 칸 인덱스 + 총 칸 수 →
  해당 칸의 SVG/data URI. `distributeWords`(단어 균등 분배) + `wrapWords`(단어 보존
  줄바꿈, 긴 단어는 글자 분할 fallback) + `cellSvg`(세로 가운데, 좌측 정렬) 조합.
- `src/question-action.ts` (신규): 위 표시 액션. `BridgeClient` 주입, `refreshAll()` 제공.
- `src/question-state.ts`: 활성 질문 본문 접근자 `questionText()` 추가.
- `src/logo-action.ts`: 단일 아이콘+이름 타일 렌더로 변경.
- `src/plugin.ts`: QuestionAction 등록 + `onChange`에서 `refreshAll()` 호출.
- `manifest.json`: Question 액션 정의 추가.
- `Claude Bridge.streamDeckProfile`: 새 키맵으로 재생성.

## 테스트

- `tests/question-image.test.ts`: 단어 균등 분배(순서 보존·5칸 사용) / 단어 보존 줄바꿈 /
  긴 단어 글자 분할 / 오버플로 `…` / idle(빈 본문) / data URI 포맷 검증.
- 기존 테스트 전부 통과 유지. rollup 빌드 성공.

## 비목표 (YAGNI)

- 질문 머리말(`header`) 별도 표시, 스크롤/페이지네이션, 폰트 크기 동적 조절은 하지 않는다.
- multiSelect 표시 방식은 이번 변경 범위 밖(기존 그대로).
