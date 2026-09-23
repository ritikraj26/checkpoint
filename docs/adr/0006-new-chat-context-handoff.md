# ADR 0006: New-Conversation Context Handoff

- Status: Accepted
- Date: 2026-09-23

## Context

The resume experience should not require finding an old chat, and it should not reopen or depend on a previous conversation. The saved checkpoint already contains the durable context needed for a fresh conversation. Automatically reading chat history is unsupported and would expand the privacy boundary.

The installed Codex VS Code extension contributes commands to open a new chat and attach a file, but its documentation does not establish a stable cross-extension API or a supported command to submit an initial prompt on another extension's behalf.

## Decision

Generate `CODEX_HANDOFF.md` beside every portable checkpoint. It contains an evidence-bound continuation instruction followed by the deterministic resume document. From the resume panel, an explicit **Continue in new Codex chat** action opens a fresh Codex composer and attaches this file through the Codex extension's contributed commands. Checkpoint verifies command availability at runtime and fails without data loss if the integration changes.

Checkpoint does not silently initiate a handoff or submit the new message. Under ADR 0008, an explicitly selected, filtered local chat transcript may also be attached. The user reviews the attachments and presses Send. If Codex is unavailable, the resume view and workspace restoration continue to work without it.

## Consequences

Users can begin a new conversation from durable project context without searching chat history. The integration remains loosely coupled and does not store provider credentials. A final user action is required because automatic submission has no supported extension API. The handoff may contain sensitive paths, commands, or resources already visible in the checkpoint, so transmission is explicit and documented.
