import * as assert from 'node:assert/strict';
import { GitRunner, GitStateCollector, parsePorcelainStatus } from '../../infrastructure/git/gitStateCollector';

suite('Git state collector', () => {
	test('parses modified, untracked, and renamed paths while filtering secrets', () => {
		const result = parsePorcelainStatus(' M src/index.ts\0?? notes.md\0R  src/new.ts\0src/old.ts\0?? .env.local\0');

		assert.deepEqual(result, [
			{ path: 'src/index.ts', status: ' M' },
			{ path: 'notes.md', status: '??' },
			{ path: 'src/new.ts', status: 'R ' },
		]);
	});

	test('degrades safely when Git is unavailable', async () => {
		const runner: GitRunner = { run: async () => { throw new Error('git missing'); } };
		const state = await new GitStateCollector(runner).collect('/workspace');

		assert.equal(state.available, false);
		assert.deepEqual(state.changedFiles, []);
		assert.match(state.error ?? '', /unavailable/);
	});
});