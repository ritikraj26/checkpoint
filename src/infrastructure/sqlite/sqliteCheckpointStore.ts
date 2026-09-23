import { randomUUID } from 'node:crypto';
import { backup, DatabaseSync, SQLInputValue } from 'node:sqlite';
import {
	CheckpointStore,
	CheckpointSummary,
	SaveCheckpointResult,
	StoreDiagnostics,
} from '../../application/checkpointStore';
import { Checkpoint, ContextItem, GitState, Project, Resource, Session, WorkspaceState } from '../../domain/models';
import { migrations } from './migrations';

type Row = Record<string, SQLInputValue>;

export class SqliteCheckpointStore implements CheckpointStore {
	private readonly database: DatabaseSync;

	constructor(private readonly databasePath: string) {
		this.database = new DatabaseSync(databasePath);
		this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
		this.migrate();
	}

	upsertProject(workspaceUri: string, name: string, now: string): Project {
		const existing = this.database.prepare('SELECT * FROM projects WHERE workspace_uri = ?').get(workspaceUri) as Row | undefined;
		if (existing) {
			this.database.prepare('UPDATE projects SET name = ?, updated_at = ? WHERE id = ?')
				.run(name, now, asString(existing.id));
			return this.getProject(asString(existing.id));
		}

		const project: Project = { id: randomUUID(), name, workspaceUri, createdAt: now, updatedAt: now };
		this.database.prepare(`
INSERT INTO projects (id, name, workspace_uri, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
`).run(project.id, project.name, project.workspaceUri, project.createdAt, project.updatedAt);
		return project;
	}

	listProjects(): Project[] {
		return (this.database.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as Row[]).map(toProject);
	}

	startSession(projectId: string, now: string): Session {
		const session: Session = {
			id: randomUUID(),
			projectId,
			startedAt: now,
			lastActivityAt: now,
		};
		this.database.prepare(`
INSERT INTO sessions (id, project_id, started_at, last_activity_at) VALUES (?, ?, ?, ?)
`).run(session.id, session.projectId, session.startedAt, session.lastActivityAt);
		return session;
	}

	saveCheckpoint(checkpoint: Checkpoint): SaveCheckpointResult {
		const duplicate = this.database.prepare(`
SELECT id FROM checkpoints WHERE project_id = ? AND fingerprint = ?
`).get(checkpoint.projectId, checkpoint.fingerprint) as Row | undefined;
		if (duplicate) {
			return { checkpoint: this.requireCheckpoint(asString(duplicate.id)), created: false };
		}

		this.database.exec('BEGIN IMMEDIATE');
		try {
			for (const item of checkpoint.contextItems) {
				this.insertContextItem(item);
			}
			for (const resource of checkpoint.resources) {
				this.insertResource(resource);
			}
			this.database.prepare(`
INSERT INTO checkpoints (
    id, project_id, session_id, parent_checkpoint_id, type, reason, created_at,
    fingerprint, git_state_json, workspace_state_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
				checkpoint.id,
				checkpoint.projectId,
				checkpoint.sessionId,
				checkpoint.parentCheckpointId ?? null,
				checkpoint.type,
				checkpoint.reason,
				checkpoint.createdAt,
				checkpoint.fingerprint,
				JSON.stringify(checkpoint.gitState),
				JSON.stringify(checkpoint.workspaceState),
			);

			const linkContext = this.database.prepare(`
INSERT INTO checkpoint_context_items (checkpoint_id, context_item_id) VALUES (?, ?)
`);
			for (const item of checkpoint.contextItems) {
				linkContext.run(checkpoint.id, item.id);
			}

			const linkResource = this.database.prepare(`
INSERT INTO checkpoint_resources (checkpoint_id, resource_id) VALUES (?, ?)
`);
			for (const resource of checkpoint.resources) {
				linkResource.run(checkpoint.id, resource.id);
			}

			this.database.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?')
				.run(checkpoint.createdAt, checkpoint.sessionId);
			this.database.prepare('UPDATE projects SET updated_at = ? WHERE id = ?')
				.run(checkpoint.createdAt, checkpoint.projectId);
			this.database.exec('COMMIT');
			return { checkpoint, created: true };
		} catch (error) {
			this.database.exec('ROLLBACK');
			throw error;
		}
	}

	listCheckpoints(projectId: string): CheckpointSummary[] {
		const rows = this.database.prepare(`
SELECT id, project_id, type, reason, created_at, fingerprint, git_state_json
FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC
`).all(projectId) as Row[];

		return rows.map((row) => {
			const gitState = parseJson<GitState>(asString(row.git_state_json));
			return {
				id: asString(row.id),
				projectId: asString(row.project_id),
				type: asString(row.type) as Checkpoint['type'],
				reason: asString(row.reason),
				createdAt: asString(row.created_at),
				branch: gitState.branch,
				changedFileCount: gitState.changedFiles.length,
				fingerprint: asString(row.fingerprint),
			};
		});
	}

	getCheckpoint(id: string): Checkpoint | undefined {
		const row = this.database.prepare('SELECT * FROM checkpoints WHERE id = ?').get(id) as Row | undefined;
		if (!row) {
			return undefined;
		}

		const contextRows = this.database.prepare(`
SELECT context_items.* FROM context_items
JOIN checkpoint_context_items ON context_items.id = checkpoint_context_items.context_item_id
WHERE checkpoint_context_items.checkpoint_id = ? ORDER BY context_items.created_at, context_items.id
`).all(id) as Row[];
		const resourceRows = this.database.prepare(`
SELECT resources.* FROM resources
JOIN checkpoint_resources ON resources.id = checkpoint_resources.resource_id
WHERE checkpoint_resources.checkpoint_id = ? ORDER BY resources.created_at, resources.id
`).all(id) as Row[];

		return {
			id: asString(row.id),
			projectId: asString(row.project_id),
			sessionId: asString(row.session_id),
			...(row.parent_checkpoint_id === null
				? {}
				: { parentCheckpointId: asString(row.parent_checkpoint_id) }),
			type: asString(row.type) as Checkpoint['type'],
			reason: asString(row.reason),
			createdAt: asString(row.created_at),
			fingerprint: asString(row.fingerprint),
			gitState: parseJson<GitState>(asString(row.git_state_json)),
			workspaceState: parseJson<WorkspaceState>(asString(row.workspace_state_json)),
			contextItems: contextRows.map(toContextItem),
			resources: resourceRows.map(toResource),
		};
	}

	getLatestCheckpoint(projectId: string): Checkpoint | undefined {
		const row = this.database.prepare(`
SELECT id FROM checkpoints WHERE project_id = ? ORDER BY created_at DESC LIMIT 1
`).get(projectId) as Row | undefined;
		return row ? this.getCheckpoint(asString(row.id)) : undefined;
	}

	addResource(resource: Resource): void {
		this.insertResource(resource);
	}

	listResources(projectId: string): Resource[] {
		return (this.database.prepare(`
SELECT * FROM resources WHERE project_id = ? ORDER BY created_at DESC
`).all(projectId) as Row[]).map(toResource);
	}

	deleteProject(projectId: string): void {
		this.database.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
	}

	async backup(destination: string): Promise<void> {
		await backup(this.database, destination);
	}

	diagnostics(): StoreDiagnostics {
		const schema = this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as Row;
		const projects = this.database.prepare('SELECT COUNT(*) AS count FROM projects').get() as Row;
		const checkpoints = this.database.prepare('SELECT COUNT(*) AS count FROM checkpoints').get() as Row;
		return {
			databasePath: this.databasePath,
			schemaVersion: asNumber(schema.version),
			projectCount: asNumber(projects.count),
			checkpointCount: asNumber(checkpoints.count),
		};
	}

	close(): void {
		this.database.close();
	}

	private migrate(): void {
		this.database.exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);
`);
		const row = this.database.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as Row;
		let currentVersion = asNumber(row.version);
		for (const migration of migrations) {
			if (migration.version <= currentVersion) {
				continue;
			}
			this.database.exec('BEGIN IMMEDIATE');
			try {
				this.database.exec(migration.sql);
				this.database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
					.run(migration.version, new Date().toISOString());
				this.database.exec('COMMIT');
				currentVersion = migration.version;
			} catch (error) {
				this.database.exec('ROLLBACK');
				throw error;
			}
		}
	}

	private getProject(id: string): Project {
		const row = this.database.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Row | undefined;
		if (!row) {
			throw new Error(`Project not found: ${id}`);
		}
		return toProject(row);
	}

	private requireCheckpoint(id: string): Checkpoint {
		const checkpoint = this.getCheckpoint(id);
		if (!checkpoint) {
			throw new Error(`Checkpoint not found: ${id}`);
		}
		return checkpoint;
	}

	private insertContextItem(item: ContextItem): void {
		this.database.prepare(`
INSERT OR IGNORE INTO context_items (
    id, project_id, kind, content, source, scope, confidence, created_at, status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`).run(
			item.id,
			item.projectId,
			item.kind,
			item.content,
			item.source,
			item.scope,
			item.confidence,
			item.createdAt,
			item.status,
		);
	}

	private insertResource(resource: Resource): void {
		this.database.prepare(`
INSERT INTO resources (id, project_id, title, uri, notes, created_at)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(project_id, uri) DO UPDATE SET title = excluded.title, notes = excluded.notes
`).run(
			resource.id,
			resource.projectId,
			resource.title,
			resource.uri,
			resource.notes ?? null,
			resource.createdAt,
		);
	}
}

function toProject(row: Row): Project {
	return {
		id: asString(row.id),
		name: asString(row.name),
		workspaceUri: asString(row.workspace_uri),
		createdAt: asString(row.created_at),
		updatedAt: asString(row.updated_at),
	};
}

function toContextItem(row: Row): ContextItem {
	return {
		id: asString(row.id),
		projectId: asString(row.project_id),
		kind: asString(row.kind) as ContextItem['kind'],
		content: asString(row.content),
		source: asString(row.source) as ContextItem['source'],
		scope: asString(row.scope) as ContextItem['scope'],
		confidence: asNumber(row.confidence),
		createdAt: asString(row.created_at),
		status: asString(row.status) as ContextItem['status'],
	};
}

function toResource(row: Row): Resource {
	return {
		id: asString(row.id),
		projectId: asString(row.project_id),
		title: asString(row.title),
		uri: asString(row.uri),
		notes: asOptionalString(row.notes),
		createdAt: asString(row.created_at),
	};
}

function asString(value: SQLInputValue): string {
	if (typeof value !== 'string') {
		throw new Error('Database value is not a string.');
	}
	return value;
}

function asOptionalString(value: SQLInputValue): string | undefined {
	return value === null ? undefined : asString(value);
}

function asNumber(value: SQLInputValue): number {
	if (typeof value !== 'number') {
		throw new Error('Database value is not a number.');
	}
	return value;
}

function parseJson<T>(value: string): T {
	return JSON.parse(value) as T;
}