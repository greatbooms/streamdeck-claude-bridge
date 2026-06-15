# Codex Permission Stream Deck Design

Date: 2026-06-15

## Goal

Add Codex CLI permission prompts to the bridge without blending them into the
existing Claude Code question UI. Claude and Codex should remain visually and
conceptually distinct on Stream Deck.

## Scope

Supported runtime: Codex CLI running inside iTerm2. Desktop and IDE surfaces are
out of scope because they do not share the existing iTerm2 key-injection path.

## Design

The bridge keeps one local aiohttp server and one WebSocket protocol, but the
question payload gains a source:

- `source: "claude"` for Claude Code `AskUserQuestion`
- `source: "codex"` for Codex `PermissionRequest`

The existing Claude hook continues to produce Claude questions. A new Codex
hook posts permission requests to `/hook/codex/permission`. The bridge converts
that payload into a `Question` with `kind: "permission"` and Codex-specific
options. This preserves the simple answer path while letting clients render and
route by source.

## Stream Deck Profiles

The plugin ships two bundled profiles:

- `Claude Bridge`: existing Claude layout and Claude visual language
- `Codex Bridge`: Codex-specific profile, logo tile, colors, and permission
  labels

The active pending item decides which profile to enter. When the latest pending
item has `source: "codex"`, the plugin switches to `Codex Bridge`; otherwise it
uses `Claude Bridge`.

## Codex Permission Rendering

Codex prompts should read as approvals, not ordinary questions.

- Header: `CODEX PERMISSION`
- Body: tool/command plus justification when available
- Buttons: approval choices such as `Approve`, `Approve session`,
  `Approve prefix`, and `Decline`
- Cancel remains Esc

The first implementation uses the same 1-based Stream Deck answer command and
iTerm2 menu navigation as Claude. The Codex parser records option action names
so a future implementation can switch to explicit Codex keymap actions without
changing the WebSocket shape.

## Hook Setup

The repo adds `.codex/hooks/on-permission-request.sh`. Users can register it in
`~/.codex/hooks.json` under the `PermissionRequest` event. A `PostToolUse` or
`Stop` cleanup hook can clear stale pending approvals when users answer in the
terminal instead of Stream Deck.

## Compatibility

Existing clients that ignore unknown fields continue to work. New clients should
use `source` and `kind` when choosing profile, styling, and labels.

## Testing

Python tests cover:

- Claude questions still default to `source: "claude"` and `kind: "question"`
- Codex permission hook payloads normalize into `source: "codex"` questions
- `/hook/codex/permission` stores and broadcasts Codex pending items

TypeScript tests cover:

- Source-aware question state
- Source-aware profile selection
- Codex-specific image/rendering behavior
- Manifest/profile presence for `Codex Bridge`
