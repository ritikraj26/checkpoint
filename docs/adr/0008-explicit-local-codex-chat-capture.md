# ADR 0008: Explicit Local Codex Chat Capture

- Status: Accepted
- Date: 2026-09-23

## Context

Workspace facts alone cannot preserve requirements, reasoning, decisions, and discoveries that exist only in a Codex conversation. Codex does not provide a documented cross-extension API for discovering the active chat, listing chats, or exporting their visible messages. Local Codex session metadata does contain workspace paths, titles, timestamps, and transcript records.

## Decision

On the first manual Save for a project, show recent local Codex chats whose recorded working directory matches the workspace. The user explicitly selects one or chooses workspace-only. Persist only that association; **Checkpoint: Select Chat** can change it.

For later manual saves, parse the selected session defensively and write a bounded `CHAT_CONTEXT.md`. Include only visible `user.text` messages and assistant output text. Exclude system/developer instructions, injected environment/plugin content, reasoning records, tool calls, and tool output. Include the transcript digest as deterministic checkpoint evidence.

On Resume, attach the checkpoint handoff and the nearest chat snapshot in the checkpoint ancestry to a fresh Codex composer. The user reviews and submits the attachments.

## Consequences

New conversations can inherit the selected chat's visible working context without reopening that thread. Selection avoids guessing which of several chats is active. The integration depends on an undocumented local storage format and therefore uses runtime discovery, restrictive parsing, tests, size bounds, and safe fallback to workspace-only checkpoints. Visible messages may themselves contain sensitive content, so capture and later transmission remain explicit.
