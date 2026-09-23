import * as assert from 'node:assert/strict';
import { mergeContextItems } from '../../application/checkpointManager';
import { ContextItem } from '../../domain/models';

suite('context merging', () => {
	test('preserves omitted durable context and replaces supplied current state', () => {
		const previous = [item('objective', 'Original goal', 'one'), item('blocker', 'Old blocker', 'two')];
		const merged = mergeContextItems(
			previous,
			{ blocker: 'New blocker', decisions: ['Use SQLite'] },
			'project',
			'2026-09-14T11:00:00.000Z',
			ids(),
		);

		assert.equal(merged.find((entry) => entry.kind === 'objective')?.content, 'Original goal');
		assert.deepEqual(merged.filter((entry) => entry.kind === 'blocker').map((entry) => entry.content), ['New blocker']);
		assert.equal(merged.find((entry) => entry.kind === 'decision')?.source, 'manual');
	});

	test('clears a singleton when the user supplies an empty value', () => {
		const merged = mergeContextItems(
			[item('blocker', 'Resolved blocker', 'one')],
			{ blocker: '' },
			'project',
			'2026-09-14T11:00:00.000Z',
			ids(),
		);

		assert.equal(merged.some((entry) => entry.kind === 'blocker'), false);
	});

	test('replaces deterministic important files instead of accumulating stale paths', () => {
		const merged = mergeContextItems(
			[
				item('objective', 'Keep this goal', 'one'),
				item('important_file', 'src/old.ts', 'two', 'deterministic'),
			],
			{ importantFiles: ['src/current.ts', 'src/current.ts'] },
			'project',
			'2026-09-14T11:00:00.000Z',
			ids(),
		);

		assert.equal(merged.find((entry) => entry.kind === 'objective')?.content, 'Keep this goal');
		assert.deepEqual(
			merged.filter((entry) => entry.kind === 'important_file').map((entry) => entry.content),
			['src/current.ts'],
		);
		assert.equal(merged.find((entry) => entry.kind === 'important_file')?.source, 'deterministic');
	});

	test('preserves important files when no deterministic capture is supplied', () => {
		const merged = mergeContextItems(
			[item('important_file', 'src/known.ts', 'one', 'deterministic')],
			{},
			'project',
			'2026-09-14T11:00:00.000Z',
			ids(),
		);

		assert.equal(merged.find((entry) => entry.kind === 'important_file')?.content, 'src/known.ts');
	});
});

function item(
	kind: ContextItem['kind'],
	content: string,
	id: string,
	source: ContextItem['source'] = 'manual',
): ContextItem {
	return {
		id,
		projectId: 'project',
		kind,
		content,
		source,
		scope: 'task',
		confidence: 1,
		createdAt: '2026-09-14T10:00:00.000Z',
		status: 'active',
	};
}

function ids(): () => string {
	let value = 0;
	return () => `id-${value += 1}`;
}
