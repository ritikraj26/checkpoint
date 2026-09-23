import { createHash } from 'node:crypto';
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join, normalize, resolve } from 'node:path';

export interface CodexChat {
	id: string;
	title: string;
	updatedAt: string;
	path: string;
}

export interface CodexChatSnapshot {
	chat: CodexChat;
	markdown: string;
	digest: string;
	messageCount: number;
}

interface SessionIndexRow {
	id?: unknown;
	thread_name?: unknown;
	updated_at?: unknown;
}

interface SessionRecord {
	type?: unknown;
	payload?: Record<string, unknown>;
}

const maximumTranscriptCharacters = 120_000;
const maximumMessages = 120;

export class CodexChatReader {
	constructor(private readonly codexRoot = process.env.CODEX_HOME || join(homedir(), '.codex')) {}

	async listForWorkspace(workspacePath: string): Promise<CodexChat[]> {
		const titles = await this.readIndex();
		const sessionRoot = join(this.codexRoot, 'sessions');
		const files = await findJsonlFiles(sessionRoot);
		const workspace = normalizedPath(workspacePath);
		const chats: CodexChat[] = [];

		for (const path of files) {
			const metadata = await readSessionMetadata(path);
			if (!metadata || normalizedPath(metadata.cwd) !== workspace) {
				continue;
			}
			const indexed = titles.get(metadata.id);
			if (!indexed) {
				continue;
			}
			const fileStat = await stat(path);
			chats.push({
				id: metadata.id,
				title: indexed.title,
				updatedAt: indexed.updatedAt || fileStat.mtime.toISOString(),
				path,
			});
		}

		return chats
			.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
			.filter((chat, index, all) => all.findIndex((candidate) => candidate.id === chat.id) === index);
	}

	async capture(chat: CodexChat): Promise<CodexChatSnapshot> {
		const records = parseJsonLines(await readFile(chat.path, 'utf8')) as SessionRecord[];
		const messages: Array<{ role: 'User' | 'Assistant'; text: string }> = [];

		for (const record of records) {
			if (record.type !== 'response_item' || record.payload?.type !== 'message') {
				continue;
			}
			const role = record.payload.role;
			if (role !== 'user' && role !== 'assistant') {
				continue;
			}
			if (role === 'user' && !isVisibleUserMessage(record.payload)) {
				continue;
			}
			const text = messageText(record.payload.content).trim();
			if (text) {
				messages.push({ role: role === 'user' ? 'User' : 'Assistant', text });
			}
		}

		const selected = takeRecentMessages(messages);
		const markdown = [
			'# Saved Codex chat context',
			'',
			`Chat: ${chat.title}`,
			`Saved chat updated: ${new Date(chat.updatedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`,
			'',
			'> This is a filtered local transcript containing visible user and assistant messages only. System/developer instructions, hidden reasoning, tool calls, and tool output are excluded.',
			'',
			...selected.flatMap((message) => [`## ${message.role}`, '', message.text, '']),
		].join('\n').trimEnd() + '\n';

		return {
			chat,
			markdown,
			digest: createHash('sha256').update(markdown).digest('hex'),
			messageCount: selected.length,
		};
	}

	private async readIndex(): Promise<Map<string, { title: string; updatedAt: string }>> {
		let content: string;
		try {
			content = await readFile(join(this.codexRoot, 'session_index.jsonl'), 'utf8');
		} catch {
			return new Map();
		}
		const rows = parseJsonLines(content) as SessionIndexRow[];
		const result = new Map<string, { title: string; updatedAt: string }>();
		for (const row of rows) {
			if (typeof row.id === 'string' && typeof row.thread_name === 'string') {
				result.set(row.id, {
					title: row.thread_name.trim() || row.id,
					updatedAt: typeof row.updated_at === 'string' ? row.updated_at : '',
				});
			}
		}
		return result;
	}
}

async function findJsonlFiles(directory: string): Promise<string[]> {
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return [];
	}
	const nested = await Promise.all(entries.map(async (entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			return findJsonlFiles(path);
		}
		return entry.isFile() && entry.name.endsWith('.jsonl') ? [path] : [];
	}));
	return nested.flat();
}

async function readSessionMetadata(path: string): Promise<{ id: string; cwd: string } | undefined> {
	const handle = await open(path, 'r');
	try {
		const buffer = Buffer.alloc(64 * 1024);
		const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
		const firstLine = buffer.subarray(0, bytesRead).toString('utf8').split('\n', 1)[0];
		const record = JSON.parse(firstLine) as SessionRecord;
		const id = record.payload?.id;
		const cwd = record.payload?.cwd;
		return record.type === 'session_meta' && typeof id === 'string' && typeof cwd === 'string'
			? { id, cwd }
			: undefined;
	} catch {
		return undefined;
	} finally {
		await handle.close();
	}
}

function parseJsonLines(content: string): unknown[] {
	const values: unknown[] = [];
	for (const line of content.split('\n')) {
		if (!line.trim()) {
			continue;
		}
		try {
			values.push(JSON.parse(line));
		} catch {
			// Ignore a partially written final line from an active Codex session.
		}
	}
	return values;
}

function isVisibleUserMessage(payload: Record<string, unknown>): boolean {
	const metadata = payload.internal_chat_message_metadata_passthrough;
	if (!metadata || typeof metadata !== 'object') {
		return true;
	}
	const kinds = (metadata as { content_item_kinds?: unknown }).content_item_kinds;
	return !Array.isArray(kinds) || kinds.includes('user.text');
}

function messageText(content: unknown): string {
	if (!Array.isArray(content)) {
		return '';
	}
	return content.flatMap((item) => {
		if (!item || typeof item !== 'object') {
			return [];
		}
		const typed = item as { type?: unknown; text?: unknown };
		return (typed.type === 'input_text' || typed.type === 'output_text') && typeof typed.text === 'string'
			? [typed.text]
			: [];
	}).join('\n');
}

function takeRecentMessages(messages: Array<{ role: 'User' | 'Assistant'; text: string }>): Array<{ role: 'User' | 'Assistant'; text: string }> {
	const selected: Array<{ role: 'User' | 'Assistant'; text: string }> = [];
	let characters = 0;
	for (const message of messages.slice(-maximumMessages).reverse()) {
		if (selected.length && characters + message.text.length > maximumTranscriptCharacters) {
			break;
		}
		selected.push(message);
		characters += message.text.length;
	}
	return selected.reverse();
}

function normalizedPath(value: string): string {
	return normalize(resolve(value));
}

export function chatDisplayDescription(chat: CodexChat): string {
	return `${new Date(chat.updatedAt).toLocaleString()} · ${basename(chat.path)}`;
}
