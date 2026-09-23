# ADR 0001: Single Extension Process

- Status: Accepted
- Date: 2026-09-14

## Context

The MVP needs VS Code activity, local Git/file access, persistence, and a resume UI. A daemon would add lifecycle, IPC, installation, and diagnostics work before cross-tool access is required.

## Decision

Run Checkpoint as one bundled TypeScript VS Code extension. Keep domain and application code independent of VS Code so a CLI or daemon can reuse it later.

## Consequences

Personal installation is one VSIX and failures remain isolated to the extension host. Cross-editor capture and background work while VS Code is closed are deferred.