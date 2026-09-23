# ADR 0007: Separate Snapshot and Context Editing

- Status: Accepted
- Date: 2026-09-23

## Context

The Save command opened a semantic-context form before it captured state. This made a simple explicit snapshot feel like data entry and confused optional human context with deterministic workspace capture.

## Decision

Make **Checkpoint: Save** capture the current Git, editor, terminal, resource, and important-file state without opening the semantic-context form. Preserve previously known semantic context through the existing merge behavior. ADR 0008 later adds a first-use chat selection prompt, after which the selection is reused.

Move the form to **Checkpoint: Update Context**. Submitting it updates semantic context and captures the current deterministic state in the same checkpoint.

## Consequences

A user can create and later resume a checkpoint with one command and no form. Semantic fields may remain unrecorded because Checkpoint cannot infer them from source files or an existing chat. Users who want richer new-chat handoffs can update those fields separately, and subsequent snapshots carry them forward.
