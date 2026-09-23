# Checkpoint

Git remembers your code. Checkpoint remembers your work.

Checkpoint is a local-first VS Code extension that captures repository and editor state together with concise engineering context. It creates a durable resume point without changing source files, Git state, or requiring an AI provider.

## Workflow

1. Open a workspace folder.
2. Checkpoint immediately creates a facts-only baseline if this project has no history.
3. Work normally. After a text edit/save, active-editor change, completed terminal command, added resource, or workspace change, Checkpoint silently saves once the workspace has been idle for 10 minutes.
4. Occasionally run **Checkpoint: Save** to seed or correct the objective, task, progress, decisions, experiments, discoveries, blocker, or next action.
5. Later, run **Checkpoint: Resume** or **Checkpoint: History**. Review the captured context and select **Continue** to reopen available files.

Resume works across recorded projects. Choosing a project in another workspace reopens that folder first, then presents its checkpoint.

Automatic checkpoints carry known semantic context forward and refresh deterministic Git, editor, terminal, resource, and important-file facts. They never infer missing goals or progress. Equivalent snapshots are deduplicated, so inactivity without a meaningful state change does not add history.

## What is captured

- Workspace URI and project metadata
- Git repository root, branch, commit, dirty state, and changed file paths
- Active and open text files
- Terminal working directories where shell integration exposes them
- Optional recent terminal commands, bounded and redacted
- Manually seeded objective, task, progress, decisions, experiments, discoveries, blocker, and next action, carried forward by automatic checkpoints
- Explicitly added URLs and local resources

Checkpoint never captures file contents, Git diff contents, terminal output, environment variables, or known credential files. Terminal command capture is off by default.

## Install locally

Requirements: VS Code 1.105 or newer. Development and packaging require Node.js 20 or newer; extension-host tests require Node.js 22 or newer.

```sh
npm ci
npm test
npm run package
npx @vscode/vsce package --out checkpoint-0.2.0.vsix
```

In VS Code, open the Extensions view, choose the **...** menu, select **Install from VSIX...**, and select `checkpoint-0.2.0.vsix`.

For development, run `npm run compile`, then use the **Run Extension** launch configuration.

## Commands

- **Checkpoint: Save**: manually seed or correct context while capturing current state
- **Checkpoint: Resume**: select a project/checkpoint and continue
- **Checkpoint: History**: inspect prior checkpoints
- **Checkpoint: Add Resource**: associate a URL or local path with the current project
- **Checkpoint: Show Context**: show the latest current-project context
- **Checkpoint: Diagnostics**: inspect runtime, schema, storage, workspace, and Git health
- **Checkpoint: Back Up Data**: create a consistent SQLite backup
- **Checkpoint: Delete Project Data**: delete a project's database rows and portable exports

## Configuration

- `checkpoint.captureTerminalCommands`: opt in to redacted terminal command capture; default `false`
- `checkpoint.maxRecentCommands`: retain 0 to 100 commands in memory for the next checkpoint; default `20`
- `checkpoint.autoCheckpoint.enabled`: enable silent activity/idle checkpoints; default `true`
- `checkpoint.autoCheckpoint.idleMinutes`: wait this many idle minutes after meaningful activity; default `10`, minimum `1`

## Storage and portability

SQLite is stored in the extension's VS Code global-storage directory. Writes use migrations, foreign keys, WAL mode, indexes, and transactions. Each saved checkpoint also has a portable directory containing:

```text
metadata.json
context.json
RESUME.md
```

Use **Checkpoint: Diagnostics** to see the exact database path. Use **Checkpoint: Back Up Data** before upgrades or machine migration.

## Upgrade and uninstall

Build and install the newer VSIX over the existing version. Schema migrations run automatically and transactionally on activation. Back up first when moving between versions.

To remove one project's context, run **Checkpoint: Delete Project Data**. To remove the extension, uninstall Checkpoint from the Extensions view. VS Code may retain global storage after uninstall; use Diagnostics before uninstall if you need the path for manual removal.

## Troubleshooting

- Run **Checkpoint: Diagnostics** and confirm `status` is `ok`.
- Inspect `autoCheckpoint` in Diagnostics to see whether automatic capture is enabled, pending, or saving, and when it most recently ran.
- Open **View: Toggle Output**, select **Checkpoint**, and inspect structured event logs.
- If Git reports unavailable, verify the workspace is a repository and `git` is on the extension host's path.
- Terminal cwd and commands require VS Code shell integration and may be unavailable for some shells or remote sessions.
- A missing or deleted file is skipped during resume and does not prevent other files from reopening.
- Checkpoint creation succeeds even if the portable export fails; a warning identifies that partial failure.

Architecture and decisions are documented in `docs/architecture.md` and `docs/adr/`.
