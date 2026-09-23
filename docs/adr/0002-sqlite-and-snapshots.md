# ADR 0002: SQLite and Immutable Snapshots

- Status: Accepted
- Date: 2026-09-14

## Context

Checkpoint needs transactional writes, migrations, indexed history, deterministic retrieval, and portable exports. Native Node addons complicate VSIX packaging across platforms.

## Decision

Use Node's built-in `node:sqlite` in the extension host. Store normalized projects, sessions, context items, and resources; store immutable per-checkpoint Git/workspace state and join references. Generate JSON/Markdown exports from the committed record.

## Consequences

No addon or daemon is required. The minimum VS Code version must embed a Node runtime with `node:sqlite`. The export is portable but not the transactional source of truth.