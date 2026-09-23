# ADR 0004: Manual-First Checkpoints

- Status: Superseded by ADR 0005
- Date: 2026-09-14

## Context

Automatic saves can create noisy history, and extension shutdown is not guaranteed. Meaningful thresholds cannot be chosen responsibly before observing personal usage.

## Decision

Ship manual checkpoints first with deterministic fingerprint deduplication. Add automatic checkpoints later using elapsed-time, changed-file, and activity-boundary thresholds.

## Consequences

The first release requires an explicit save, but history remains meaningful. The checkpoint type already supports `auto` without changing the model.
