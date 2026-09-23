import { createHash } from 'node:crypto';
import { Checkpoint, CheckpointDraft, contextKinds, ContextKind, ResumeContext } from './models';

export class DomainValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DomainValidationError';
	}
}

export function createCheckpoint(draft: CheckpointDraft): Checkpoint {
	validateDraft(draft);
	return { ...draft, fingerprint: fingerprintCheckpoint(draft) };
}

export function fingerprintCheckpoint(draft: CheckpointDraft): string {
	const evidence = {
		projectId: draft.projectId,
		gitState: draft.gitState,
		workspaceState: draft.workspaceState,
		context: draft.contextItems
			.map(({ kind, content, status }) => ({ kind, content, status }))
			.sort((left, right) => compareJson(left, right)),
		resources: draft.resources
			.map(({ title, uri, notes }) => ({ title, uri, notes }))
			.sort((left, right) => compareJson(left, right)),
	};

	return createHash('sha256').update(stableJson(evidence)).digest('hex');
}

function compareJson(left: unknown, right: unknown): number {
	const leftJson = stableJson(left);
	const rightJson = stableJson(right);
	return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
}

export function buildResumeContext(
	project: ResumeContext['project'],
	checkpoint: Checkpoint,
): ResumeContext {
	const active = checkpoint.contextItems.filter((item) => item.status === 'active');
	const byKind = (kind: ContextKind) => active.filter((item) => item.kind === kind);

	return {
		project,
		checkpoint,
		objective: byKind('objective').at(-1),
		currentTask: byKind('current_task').at(-1),
		progress: byKind('progress'),
		decisions: byKind('decision'),
		experiments: byKind('experiment'),
		discoveries: byKind('discovery'),
		blockers: byKind('blocker'),
		nextActions: byKind('next_action'),
		importantFiles: byKind('important_file'),
		resources: checkpoint.resources,
	};
}

function validateDraft(draft: CheckpointDraft): void {
	if (!draft.id || !draft.projectId || !draft.sessionId) {
		throw new DomainValidationError('Checkpoint, project, and session identifiers are required.');
	}
	if (!draft.reason.trim()) {
		throw new DomainValidationError('A checkpoint reason is required.');
	}
	if (Number.isNaN(Date.parse(draft.createdAt))) {
		throw new DomainValidationError('Checkpoint createdAt must be an ISO-8601 timestamp.');
	}
	for (const item of draft.contextItems) {
		if (!contextKinds.includes(item.kind) || !item.content.trim()) {
			throw new DomainValidationError('Context items require a supported kind and non-empty content.');
		}
		if (item.confidence < 0 || item.confidence > 1) {
			throw new DomainValidationError('Context confidence must be between 0 and 1.');
		}
	}
}

function stableJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableJson).join(',')}]`;
	}
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
	}
	return JSON.stringify(value);
}
