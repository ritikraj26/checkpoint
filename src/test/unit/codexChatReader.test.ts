import * as assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexChatReader } from '../../infrastructure/codex/codexChatReader';

suite('Codex chat reader', () => {
	test('lists workspace chats and captures only visible user and assistant messages', async () => {
		const root = mkdtempSync(join(tmpdir(), 'checkpoint-codex-'));
		const workspace = join(root, 'workspace');
		const sessionDirectory = join(root, 'sessions', '2026', '09', '23');
		mkdirSync(sessionDirectory, { recursive: true });
		const sessionPath = join(sessionDirectory, 'rollout-chat.jsonl');
		writeFileSync(join(root, 'session_index.jsonl'), `${JSON.stringify({ id: 'chat-1', thread_name: 'Fix checkout', updated_at: '2026-09-23T10:00:00.000Z' })}\n`);
		writeFileSync(sessionPath, [
			{ type: 'session_meta', payload: { id: 'chat-1', cwd: workspace } },
			{ type: 'response_item', payload: { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'DO_NOT_INCLUDE_DEVELOPER' }] } },
			{ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'DO_NOT_INCLUDE_ENVIRONMENT' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['environments.environment_context'] } } },
			{ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Fix the checkout bug' }], internal_chat_message_metadata_passthrough: { content_item_kinds: ['user.text'] } } },
			{ type: 'response_item', payload: { type: 'reasoning', summary: ['DO_NOT_INCLUDE_REASONING'] } },
			{ type: 'response_item', payload: { type: 'custom_tool_call_output', output: 'DO_NOT_INCLUDE_TOOL_OUTPUT' } },
			{ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'I changed the validation.' }] } },
		].map((record) => JSON.stringify(record)).join('\n'));

		try {
			const reader = new CodexChatReader(root);
			const chats = await reader.listForWorkspace(workspace);
			assert.equal(chats.length, 1);
			assert.equal(chats[0].title, 'Fix checkout');

			const snapshot = await reader.capture(chats[0]);
			const repeated = await reader.capture(chats[0]);
			assert.equal(snapshot.messageCount, 2);
			assert.equal(snapshot.digest, repeated.digest);
			assert.match(snapshot.markdown, /Fix the checkout bug/);
			assert.match(snapshot.markdown, /I changed the validation/);
			assert.doesNotMatch(snapshot.markdown, /DO_NOT_INCLUDE/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
