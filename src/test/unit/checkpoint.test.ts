import * as assert from 'node:assert/strict';
import { buildResumeContext, createCheckpoint, DomainValidationError } from '../../domain/checkpoint';
import { CheckpointDraft, Project } from '../../domain/models';

suite('checkpoint domain', () => {
	test('creates a stable fingerprint that ignores snapshot identity and time', () => {
		const first = createCheckpoint(draft());
		const second = createCheckpoint({
			...draft(),
			id: 'checkpoint-2',
			type: 'auto',
			reason: 'Automatic checkpoint after inactivity',
			createdAt: '2026-09-14T12:00:00.000Z',
			contextItems: [...draft().contextItems].reverse(),
		});

		assert.equal(first.fingerprint, second.fingerprint);
	});

	test('rejects context confidence outside the supported range', () => {
		const invalid = draft();
		invalid.contextItems[0].confidence = 1.1;

		assert.throws(() => createCheckpoint(invalid), DomainValidationError);
	});

	test('builds a compact resume context from active evidence', () => {
		const checkpoint = createCheckpoint(draft());
		const project: Project = {
			id: 'project-1',
			name: 'Checkpoint',
			workspaceUri: 'file:///workspace',
			createdAt: checkpoint.createdAt,
			updatedAt: checkpoint.createdAt,
		};

		const context = buildResumeContext(project, checkpoint);

		assert.equal(context.objective?.content, 'Ship the vertical slice');
		assert.equal(context.nextActions[0].content, 'Implement storage');
	});
});

function draft(): CheckpointDraft {
	const createdAt = '2026-09-14T10:00:00.000Z';
	return {
		id: 'checkpoint-1',
		projectId: 'project-1',
		sessionId: 'session-1',
		type: 'manual',
		reason: 'Manual checkpoint',
		createdAt,
		gitState: {
			available: true,
			repositoryRoot: '/workspace',
			branch: 'main',
			commit: 'abc123',
			isDirty: true,
			changedFiles: [{ path: 'src/extension.ts', status: 'M' }],
		},
		workspaceState: {
			workspaceUris: ['file:///workspace'],
			activeFile: 'src/extension.ts',
			openFiles: ['src/extension.ts'],
			terminalCwds: ['/workspace'],
			recentCommands: [],
		},
		contextItems: [
			{
				id: 'context-1',
				projectId: 'project-1',
				kind: 'objective',
				content: 'Ship the vertical slice',
				source: 'manual',
				scope: 'task',
				confidence: 1,
				createdAt,
				status: 'active',
			},
			{
				id: 'context-2',
				projectId: 'project-1',
				kind: 'next_action',
				content: 'Implement storage',
				source: 'manual',
				scope: 'task',
				confidence: 1,
				createdAt,
				status: 'active',
			},
		],
		resources: [],
	};
}
