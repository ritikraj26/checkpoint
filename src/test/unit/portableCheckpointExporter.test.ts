import * as assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCheckpoint } from '../../domain/checkpoint';
import { Project } from '../../domain/models';
import { PortableCheckpointExporter } from '../../infrastructure/export/portableCheckpointExporter';

suite('portable checkpoint export', () => {
	test('writes versioned metadata, structured context, and an actionable resume document', async () => {
		const root = mkdtempSync(join(tmpdir(), 'checkpoint-export-'));
		const project: Project = {
			id: 'project',
			name: 'Checkpoint',
			workspaceUri: 'file:///workspace',
			createdAt: '2026-09-14T10:00:00.000Z',
			updatedAt: '2026-09-14T10:00:00.000Z',
		};
		const checkpoint = createCheckpoint({
			id: 'checkpoint',
			projectId: project.id,
			sessionId: 'session',
			type: 'manual',
			reason: 'Manual checkpoint',
			createdAt: project.createdAt,
			gitState: { available: true, branch: 'main', commit: 'abcdef1234567890', isDirty: false, changedFiles: [] },
			workspaceState: { workspaceUris: [project.workspaceUri], openFiles: [], terminalCwds: [], recentCommands: [] },
			contextItems: [{
				id: randomUUID(), projectId: project.id, kind: 'objective', content: 'Ship MVP', source: 'manual',
				scope: 'project', confidence: 1, createdAt: project.createdAt, status: 'active',
			}],
			resources: [],
		});

		try {
			const directory = await new PortableCheckpointExporter(root).export(project, checkpoint);
			const metadata = JSON.parse(readFileSync(join(directory, 'metadata.json'), 'utf8')) as { schemaVersion: number };
			const resume = readFileSync(join(directory, 'RESUME.md'), 'utf8');

			assert.equal(metadata.schemaVersion, 1);
			assert.match(resume, /## Goal\nShip MVP/);
			assert.match(resume, /## Next action\nNone recorded\./);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});