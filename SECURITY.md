# Security and Privacy

Checkpoint stores engineering context locally in VS Code global storage. Version 0.2.0 has no network client, telemetry, cloud sync, or AI provider implementation. No context is transmitted externally.

Automatic checkpointing is enabled by default. It reacts to VS Code activity events and performs one capture after the configured idle interval; it does not poll Git, scan file contents, or depend on shutdown. Automatic saves refresh the same metadata as manual saves and carry forward only semantic context that a user previously supplied. They do not infer or generate objectives, progress, decisions, or next actions.

Terminal command capture is disabled by default. When enabled, Checkpoint retains only a bounded in-memory list until the next checkpoint, rejects low-confidence shell integration records, and redacts common secret assignments, flags, authorization headers, URL credentials, and sensitive query parameters. Redaction is defense in depth, not a guarantee; leave command capture disabled for sensitive terminal workflows.

Checkpoint does not read file contents, terminal output, environment variables, or Git diff contents. Known secret and credential paths are excluded from editor/Git capture and explicit resources. Disable `checkpoint.autoCheckpoint.enabled` if even automatic local metadata capture is inappropriate for a workspace.

Use **Checkpoint: Back Up Data** for a consistent local backup and **Checkpoint: Delete Project Data** to delete a project's database records and portable exports. Logs contain event names, counts, booleans, and error types rather than captured context.

AI integrations must remain opt-in and disclose exactly what structured evidence will leave the machine before transmission. No AI provider is implemented in this release.
