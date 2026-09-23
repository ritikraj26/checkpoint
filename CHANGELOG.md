# Changelog

All notable changes to Checkpoint are documented in this file.

## [0.4.0] - 2026-09-23

- Changed **Checkpoint: Save** into an immediate, no-form snapshot of the current Git, editor, terminal, resource, and important-file state.
- Added **Checkpoint: Update Context** for the optional objective, task, progress, decisions, experiments, discoveries, blocker, and next-action form.
- Continued carrying any previously known semantic context into manual and automatic snapshots.

## [0.3.0] - 2026-09-23

- Added an explicit **Continue in new Codex chat** resume action.
- Added `CODEX_HANDOFF.md`, a portable, evidence-bound prompt that tells a new conversation to verify live state and never fabricate missing context.
- Kept AI handoff user-initiated: Checkpoint opens a fresh Codex composer and attaches the handoff, but does not submit it or inspect previous chats.
- Split resume actions into Codex continuation and deterministic workspace-file restoration.

## [0.2.0] - 2026-09-23

- Added automatic checkpoints after meaningful activity and a configurable idle interval, enabled by default at 10 minutes.
- Added immediate facts-only baselines for projects without history.
- Preserved user-authored semantic context across automatic saves while refreshing deterministic workspace evidence.
- Added serialized scheduling, live configuration changes, activity-during-save follow-ups, silent failure logging, and automatic status in Diagnostics.
- Replaced stale deterministic important-file context and strengthened equivalent-snapshot deduplication.
- Fixed background activation by removing the duplicate empty `activationEvents` declaration.

## [0.1.0] - 2026-09-14

- Added local project/session detection and transactional SQLite persistence.
- Added manual checkpoint save, project history, cross-workspace resume, and file restoration.
- Added deterministic Git/editor/terminal state collection with secret filtering.
- Added provenance-bearing context, explicit resources, and portable JSON/Markdown exports.
- Added diagnostics, consistent database backup, and project data deletion.
- Added domain, failure, storage, export, and extension-host tests.
