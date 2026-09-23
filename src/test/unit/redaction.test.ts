import * as assert from 'node:assert/strict';
import { filterSafePaths, redactCommand } from '../../domain/redaction';

suite('privacy redaction', () => {
	test('removes common secret values from commands', () => {
		const command = 'API_TOKEN=abc curl --password hunter2 -H "Authorization: Bearer abc" "https://user:pass@example.com?access_token=xyz"';

		assert.equal(
			redactCommand(command),
			'API_TOKEN=[REDACTED] curl --password [REDACTED] -H "Authorization: Bearer [REDACTED]" "https://user:[REDACTED]@example.com?access_token=[REDACTED]"',
		);
	});

	test('excludes known credential files', () => {
		assert.deepEqual(
			filterSafePaths(['src/index.ts', '.env.local', '/home/user/.ssh/id_rsa', '.npmrc']),
			['src/index.ts'],
		);
	});
});