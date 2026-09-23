# Checkpoint Architecture

## Decision summary

Checkpoint is one local VS Code extension written in TypeScript. Its application layer coordinates state collection, automatic scheduling, context capture, persistence, and resume. SQLite in the extension global-storage directory is the source of truth. There is no daemon, cloud service, CLI, or required AI provider. An explicit resume action can hand a portable context document to an installed Codex extension.

This is the smallest process model that can observe the editor and Git, survive workspace switches, and provide a useful resume experience. The domain and application layers do not import VS Code or SQLite APIs, preserving a path to a future CLI or local service.

## Boundaries

```text
src/domain/             Models, validation, deduplication, redaction
src/application/        Save, list, resume, resource, diagnostics use cases
src/infrastructure/git/ Git command adapter
src/infrastructure/sqlite/ Migrations and repositories
src/infrastructure/export/ Portable checkpoint writer
src/vscode/             Collectors, commands, inputs, resume UI
src/extension.ts        Composition root only
```

Dependencies point inward: VS Code and infrastructure implement interfaces owned by the application/domain layers. The optional AI boundary is `ContextSummarizer`; deterministic checkpoint creation never calls it.

## MVP domain

Persist now:

- `Project`: stable identity for a workspace URI.
- `Session`: a period of extension activity for a project.
- `Checkpoint`: immutable state and context reference at a point in time.
- `ContextItem`: provenance-bearing objective, task, progress, decision, experiment, discovery, blocker, next action, important file, or note.
- `Resource`: an explicitly added URL or local path.

Derived now: `GitState`, `WorkspaceState`, and the compact `ResumeContext`. Events remain an in-process typed seam in V1; an event log is deferred until replay or richer automatic capture proves necessary.

## Checkpoint lifecycle

1. Detect one open workspace and upsert its project.
2. If the project has no history and automatic capture is enabled, create an immediate facts-only baseline.
3. Observe text edits/saves, active-editor changes, terminal command completion, resource additions, and workspace changes. Restart one idle timer on each meaningful activity signal; do not poll Git.
4. After the configured idle interval, collect Git state, active/open files, terminal cwd, and opted-in recent commands through the same capture path used by manual saves.
5. Carry forward previously known semantic context, replace deterministic important-file evidence, and save an immutable `auto` checkpoint transactionally. Fingerprints deduplicate equivalent evidence regardless of checkpoint identity, time, type, reason, or collection order.
6. Manual Save creates an immediate facts snapshot without prompting. The separate Update Context command records or corrects semantic context; automatic capture never fabricates it.
7. Render resume state and write `metadata.json`, `context.json`, `RESUME.md`, and `CODEX_HANDOFF.md` as a portable export.
8. On explicit request, open a fresh Codex chat and attach `CODEX_HANDOFF.md`. Checkpoint does not read old conversations or submit the new message.

`AutoCheckpointScheduler` belongs to the VS Code-independent application layer. It owns debouncing, live configuration, save serialization, follow-up work after activity during a save, disposal, and diagnostic state. The controller translates editor events into activity and supplies the capture/save callback. Correctness never depends on extension shutdown.

## Highest-risk assumptions

1. **Resume value:** deterministic facts plus concise manual context are useful without AI. Measure through daily use before provider work.
2. **Capture quality:** terminal shell integration is not universal. Command capture is opt-in, redacted, bounded, and never required.
3. **Storage runtime:** built-in `node:sqlite` requires the Node runtime bundled with VS Code 1.105+. Packaging and extension-host integration tests guard this.
4. **Checkpoint noise:** activity is debounced until 10 minutes of inactivity, and deterministic fingerprints prevent equivalent snapshots from creating history.
5. **Shutdown reliability:** extension deactivation is best-effort. Correctness cannot depend on a shutdown checkpoint.

## Reliability and observability

- SQLite writes use transactions, foreign keys, WAL mode, schema migrations, and indexed retrieval.
- Fingerprints deduplicate equivalent snapshots. Checkpoint creation never modifies the workspace or Git.
- Automatic diagnostics expose configuration, pending/save state, last activity, next due time, last run, and the latest error without logging captured context.
- Structured logs go to a dedicated output channel with secrets excluded.
- `Checkpoint: Diagnostics` reports runtime, database, migration, workspace, and Git health.
- Codex handoff failures leave the deterministic resume document and workspace restoration available.

## Deferred deliberately

A CLI, embedded AI provider implementations, automatic chat ingestion, full event persistence, context sharing/forking, cloud sync, and exact editor/terminal process restoration remain deferred. Immutable checkpoint identity and optional `parentCheckpointId` preserve a path to sharing and forks.
