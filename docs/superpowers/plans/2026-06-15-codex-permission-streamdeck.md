# Codex Permission Stream Deck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Codex CLI permission prompts on a separate Codex Stream Deck profile while preserving the existing Claude Code question flow.

**Architecture:** Extend the shared bridge payload with `source` and `kind`, add a Codex hook endpoint that normalizes `PermissionRequest` input, and make the Stream Deck plugin switch between `Claude Bridge` and `Codex Bridge` profiles based on the active item source. Keep iTerm2 injection and WebSocket transport shared.

**Tech Stack:** Python 3.10, aiohttp, pytest, TypeScript, Stream Deck SDK, Vitest, Rollup.

---

### Task 1: Bridge Model and Codex Hook API

**Files:**
- Modify: `bridge/models.py`
- Modify: `bridge/hooks_api.py`
- Modify: `bridge/server.py`
- Test: `tests/test_models.py`
- Test: `tests/test_hooks_api.py`

- [ ] **Step 1: Write failing tests**

Add tests asserting Claude payloads include `source: "claude"` and Codex permission payloads normalize into `source: "codex"`, `kind: "permission"`, and approval options.

- [ ] **Step 2: Run tests to verify failure**

Run: `python3 -m pytest tests/test_models.py tests/test_hooks_api.py -q`

Expected: tests fail because Codex parsing and route do not exist.

- [ ] **Step 3: Implement model fields and parser**

Add `source`, `kind`, and optional `action` fields. Implement `codex_permission_from_hook(body)`.

- [ ] **Step 4: Add route and handler**

Add `POST /hook/codex/permission` and broadcast the resulting pending item.

- [ ] **Step 5: Verify**

Run: `python3 -m pytest tests/test_models.py tests/test_hooks_api.py -q`

Expected: pass.

### Task 2: Codex Hook Scripts and Docs

**Files:**
- Create: `.codex/hooks/on-permission-request.sh`
- Create: `.codex/hooks/on-resolved.sh`
- Modify: `README.md`
- Modify: `SETUP.md`

- [ ] **Step 1: Add hook scripts**

Create shell hooks that read Codex hook stdin, attach `ITERM_SESSION_ID`, and post to the bridge. Scripts must always exit 0.

- [ ] **Step 2: Add setup docs**

Document `~/.codex/hooks.json` registration for `PermissionRequest` and cleanup events.

- [ ] **Step 3: Verify scripts parse**

Run: `bash -n .codex/hooks/on-permission-request.sh .codex/hooks/on-resolved.sh`

Expected: no output and exit 0.

### Task 3: Stream Deck Source-Aware State and Profile Switching

**Files:**
- Modify: `streamdeck-plugin/src/types.ts`
- Modify: `streamdeck-plugin/src/question-state.ts`
- Modify: `streamdeck-plugin/src/profile-switcher.ts`
- Modify: `streamdeck-plugin/src/plugin.ts`
- Test: `streamdeck-plugin/tests/types.test.ts`
- Test: `streamdeck-plugin/tests/question-state.test.ts`
- Test: `streamdeck-plugin/tests/profile-switcher.test.ts`

- [ ] **Step 1: Write failing tests**

Add TS tests for `source` defaults in fixtures, active source lookup, and dynamic profile switching.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd streamdeck-plugin && npx vitest run tests/types.test.ts tests/question-state.test.ts tests/profile-switcher.test.ts`

Expected: tests fail because source-aware APIs do not exist.

- [ ] **Step 3: Implement source-aware types/state/profile switching**

Add `Source` and `QuestionKind` types, `activeSource()`, and `ProfileSwitcher.enter(profileName)`.

- [ ] **Step 4: Verify**

Run the same Vitest command.

Expected: pass.

### Task 4: Codex Visuals and Bundled Profile

**Files:**
- Modify: `streamdeck-plugin/src/answer-image.ts`
- Modify: `streamdeck-plugin/src/question-image.ts`
- Create: `streamdeck-plugin/src/codex-logo-action.ts`
- Modify: `streamdeck-plugin/src/plugin.ts`
- Modify: `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/manifest.json`
- Create: `streamdeck-plugin/com.shinsanghoon.claude-bridge.sdPlugin/Codex Bridge.streamDeckProfile`
- Test: `streamdeck-plugin/tests/answer-image.test.ts`
- Test: `streamdeck-plugin/tests/question-image.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests proving Codex-themed SVGs use distinct colors/text and that image functions still support Claude defaults.

- [ ] **Step 2: Run tests to verify failure**

Run: `cd streamdeck-plugin && npx vitest run tests/answer-image.test.ts tests/question-image.test.ts`

Expected: tests fail because theme parameters are missing.

- [ ] **Step 3: Implement theme-aware renderers and Codex logo action**

Keep Claude as the default theme. Render Codex answer/question keys with Codex colors and a `CODEX` logo tile.

- [ ] **Step 4: Add manifest profile/action entries and generate Codex profile zip**

Add `Codex Bridge` to `Profiles` and include Codex logo action in the profile layout.

- [ ] **Step 5: Verify**

Run: `cd streamdeck-plugin && npx vitest run`

Expected: pass.

### Task 5: Full Verification

**Files:**
- All changed files

- [ ] **Step 1: Run Python tests**

Run: `python3 -m pytest -q`

Expected: pass.

- [ ] **Step 2: Run plugin tests**

Run: `cd streamdeck-plugin && npx vitest run`

Expected: pass.

- [ ] **Step 3: Build plugin**

Run: `cd streamdeck-plugin && npm run build`

Expected: Rollup builds `bin/plugin.js` without errors.
