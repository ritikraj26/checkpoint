# Checkpoint Project Handoff

Workspace: `/Users/ritiraj/Desktop/etc/checkpoint`

Checkpoint is a local-first VS Code extension for preserving engineering context between work sessions. Version `0.1.0` is implemented, tested, packaged, and installed as `checkpoint-local.checkpoint@0.1.0`.

## Current Features

- Manual checkpoint form
- Git branch, commit, status, and changed-file capture
- Active/open editor capture
- Terminal cwd capture
- Optional redacted terminal command capture
- SQLite persistence with migrations and transactions
- Project history and cross-workspace resume
- Portable `metadata.json`, `context.json`, and `RESUME.md`
- Resource capture, diagnostics, backup, and deletion
- No cloud service or required AI provider

Architecture is documented in:

- `docs/architecture.md`
- `docs/adr/`

Tests currently pass, including VS Code extension-host tests against VS Code 1.105.

## Requested Change

Implement automatic checkpoints so manual Save is not required.

Approved behavior:

- Automatic checkpointing enabled by default
- Save after meaningful activity followed by 10 minutes of inactivity
- Create an immediate facts-only baseline for a project with no history
- Preserve known objective, task, progress, decisions, experiments, discoveries, blocker, and next action
- Refresh Git, changed files, open/active files, terminal state, commands, resources, and important files
- Never fabricate unknown semantic context
- Keep manual Save for occasionally seeding or correcting semantic context
- Automatic saves should be silent
- Deduplicate unchanged snapshots
- Do not add AI, file-content scanning, Git polling, or shutdown-dependent saves

## Important Existing Behavior

`CheckpointManager.save()` in `src/application/checkpointManager.ts` already loads the latest checkpoint and carries forward omitted context through `mergeContextItems()`.

Checkpoint fingerprints in `src/domain/checkpoint.ts` ignore snapshot identity and timestamps, enabling deterministic deduplication.

The SQLite schema already supports checkpoint types `manual` and `auto`; no migration should be required.

## Known Defect

`package.json` declares `activationEvents` twice. The later empty declaration overrides `onStartupFinished`, preventing reliable background activation. Remove the duplicate empty declaration.

## Implementation Outline

1. Add settings:
   - `checkpoint.autoCheckpoint.enabled`, default `true`
   - `checkpoint.autoCheckpoint.idleMinutes`, default `10`
2. Extend `CheckpointManager.save()` to accept checkpoint type and reason.
3. Make deterministic `important_file` items replace stale prior values instead of accumulating indefinitely.
4. Add a VS Code-independent `AutoCheckpointScheduler` with:
   - Debouncing
   - Runtime configuration changes
   - No overlapping saves
   - Follow-up scheduling when activity occurs during a save
   - Disposal and diagnostics state
5. Trigger activity from:
   - Text edits and saves
   - Active editor changes
   - Completed terminal commands
   - Added resources
   - Workspace changes
6. Refactor manual and automatic capture to share Git/workspace collection.
7. Add automatic status to `Checkpoint: Diagnostics`.
8. Update tests, README, architecture, security documentation, and ADRs.
9. Bump to `0.2.0`, package, test, and install `checkpoint-0.2.0.vsix`.

The detailed implementation plan is stored in session memory at `/memories/session/plan.md`.

## Required Validation

- `npm run test:unit`
- `npm run compile`
- Extension-host tests against VS Code 1.105
- `npm test`
- Manual one-minute idle test
- VSIX manifest inspection
- Install and verify `checkpoint-local.checkpoint@0.2.0`

Proceed with implementation, tests, packaging, and local installation without waiting for another confirmation.
