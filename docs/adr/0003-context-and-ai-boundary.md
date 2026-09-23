# ADR 0003: Provenance-First Context and Optional AI

- Status: Accepted
- Date: 2026-09-14

## Context

Resume summaries are harmful if they fabricate decisions or hide their source. Provider coupling would also make local capture unreliable and create silent data-transfer risk.

## Decision

Represent context as typed items with source, scope, timestamp, confidence, and status. Deterministic facts and manual context work offline. AI integrates only through provider-neutral summarizer/extractor interfaces and requires explicit future configuration and transmission consent.

ADR 0006 later permits an explicit, document-based handoff to an installed Codex extension. ADR 0008 additionally permits explicit, filtered access to a user-selected local Codex transcript; it does not add automatic summarization or background transmission.

## Consequences

V1 has less automatic prose but trustworthy provenance. AI providers can be added without changing checkpoint creation or stored context.
