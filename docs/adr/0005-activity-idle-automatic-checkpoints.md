# ADR 0005: Activity/Idle Automatic Checkpoints

- Status: Accepted
- Date: 2026-09-23

## Context

Manual checkpoints preserve high-quality semantic context but are easy to forget. Saving on every editor event would create noise and unnecessary Git processes, while saving only during extension shutdown is unreliable. Missing semantic context must not be guessed.

## Decision

Enable automatic checkpointing by default. Create a facts-only baseline immediately when an open project has no history. After that, treat text edits and saves, active-editor changes, completed terminal commands, resource additions, and workspace changes as meaningful activity. Debounce those signals and save after 10 minutes of inactivity by default.

Use a VS Code-independent scheduler that supports live configuration, prevents overlapping automatic saves, schedules follow-up work when activity arrives during a save, and exposes diagnostic state. Automatic and manual saves share state collection and persistence. Automatic saves carry forward known user-authored semantic context, replace deterministic important-file evidence, and remain silent. Equivalent fingerprints are deduplicated.

Do not add periodic Git polling, file-content scanning, AI inference, or shutdown-dependent saves.

## Consequences

Projects gain useful resume history without requiring a manual action. An explicit context-editing command remains available for seeding and correcting goals, decisions, blockers, and next actions. Git runs only for an immediate first baseline or after an activity/idle boundary. A failed automatic save is recorded in logs and Diagnostics without interrupting the user; later activity can try again.
