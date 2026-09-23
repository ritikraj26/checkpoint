import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCheckpoint } from '../../domain/checkpoint';
import { CheckpointDraft } from '../../domain/models';
import { SqliteCheckpointStore } from '../../infrastructure/sqlite/sqliteCheckpointStore';

suite('SQLite checkpoint store', () => {
	let directory: string;
	let store: SqliteCheckpointStore;

	setup(() => {
		directory = mkdtempSync(join(tmpdir(), 'checkpoint-test-'));
		store = new SqliteCheckpointStore(join(directory, 'checkpoint.sqlite3'));
	});

	teardown(() => {
		store.close();
		rmSync(directory, { recursive: true, force: true });
	});

	test('migrates a new database and retrieves an immutable checkpoint', () => {
		const now = '2026-09-14T10:00:00.000Z';
		const project = store.upsertProject('file:///workspace', 'Workspace', now);
		const session = store.startSession(project.id, now);
		const checkpoint = createCheckpoint(draft(project.id, session.id));

		const result = store.saveCheckpoint(checkpoint);
		const restored = store.getCheckpoint(checkpoint.id);

		assert.equal(result.created, true);
		assert.deepEqual(restored, checkpoint);
		assert.deepEqual(store.diagnostics(), {
			databasePath: join(directory, 'checkpoint.sqlite3'),
			schemaVersion: 1,
			projectCount: 1,
			checkpointCount: 1,
		});
	});

	test('deduplicates equivalent project snapshots', () => {
		const now = '2026-09-14T10:00:00.000Z';
		const project = store.upsertProject('file:///workspace', 'Workspace', now);
		const session = store.startSession(project.id, now);
		const first = createCheckpoint(draft(project.id, session.id));
		const second = createCheckpoint({
			...draft(project.id, session.id),
			id: randomUUID(),
			createdAt: '2026-09-14T11:00:00.000Z',
		});

		store.saveCheckpoint(first);
		const result = store.saveCheckpoint(second);

		assert.equal(result.created, false);
		assert.equal(result.checkpoint.id, first.id);
		assert.equal(store.listCheckpoints(project.id).length, 1);
	});
});

function draft(projectId: string, sessionId: string): CheckpointDraft {
	return {
		id: randomUUID(),
		projectId,
		sessionId,
		type: 'manual',
		reason: 'Manual checkpoint',
		createdAt: '2026-09-14T10:00:00.000Z',
		gitState: {
			available: true,
			repositoryRoot: '/workspace',
			branch: 'main',
			commit: 'abc123',
			isDirty: true,
			changedFiles: [{ path: 'src/index.ts', status: 'M' }],
		},
		workspaceState: {
			workspaceUris: ['file:///workspace'],
			activeFile: 'src/index.ts',
			openFiles: ['src/index.ts'],
			terminalCwds: ['/workspace'],
			recentCommands: [],
		},
		contextItems: [
			{
				id: randomUUID(),
				projectId,
				kind: 'objective',
				content: 'Ship the storage slice',
				source: 'manual',
				scope: 'task',
				confidence: 1,
				createdAt: '2026-09-14T10:00:00.000Z',
				status: 'active',
			},
		],
		resources: [],
	};
}