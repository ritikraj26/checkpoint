import { randomUUID } from 'node:crypto';
import { createCheckpoint } from '../domain/checkpoint';
import {
	Checkpoint,
	CheckpointType,
	ContextItem,
	ContextKind,
	GitState,
	Project,
	Session,
	WorkspaceState,
} from '../domain/models';
import { CheckpointStore, SaveCheckpointResult } from './checkpointStore';

export interface CapturedState {
	gitState: GitState;
	workspaceState: WorkspaceState;
}

export interface ContextInput {
	objective?: string;
	currentTask?: string;
	progress?: string;
	blocker?: string;
	nextAction?: string;
	decisions?: string[];
	experiments?: string[];
	discoveries?: string[];
	importantFiles?: string[];
	chatReference?: string;
}

export interface CheckpointExporter {
	export(project: Project, checkpoint: Checkpoint): Promise<string>;
}

export interface SaveResult extends SaveCheckpointResult {
	exportDirectory?: string;
	exportError?: string;
}

export class CheckpointManager {
	constructor(
		private readonly store: CheckpointStore,
		private readonly exporter: CheckpointExporter,
		private readonly createId: () => string = randomUUID,
		private readonly now: () => Date = () => new Date(),
	) {}

	async save(
		project: Project,
		session: Session,
		state: CapturedState,
		input: ContextInput,
		type: CheckpointType = 'manual',
		reason = type === 'manual' ? 'Manual checkpoint' : 'Automatic checkpoint after inactivity',
	): Promise<SaveResult> {
		const createdAt = this.now().toISOString();
		const previous = this.store.getLatestCheckpoint(project.id);
		const contextItems = mergeContextItems(
			previous?.contextItems ?? [],
			input,
			project.id,
			createdAt,
			this.createId,
		);
		const checkpoint = createCheckpoint({
			id: this.createId(),
			projectId: project.id,
			sessionId: session.id,
			parentCheckpointId: previous?.id,
			type,
			reason,
			createdAt,
			gitState: state.gitState,
			workspaceState: state.workspaceState,
			contextItems,
			resources: this.store.listResources(project.id),
		});
		const saved = this.store.saveCheckpoint(checkpoint);

		try {
			const exportDirectory = await this.exporter.export(project, saved.checkpoint);
			return { ...saved, exportDirectory };
		} catch (error) {
			return { ...saved, exportError: errorMessage(error) };
		}
	}
}

export function mergeContextItems(
	previous: ContextItem[],
	input: ContextInput,
	projectId: string,
	createdAt: string,
	createId: () => string,
): ContextItem[] {
	const active = previous.filter((item) => item.status === 'active');
	const singletonInputs: Array<[ContextKind, string | undefined]> = [
		['objective', input.objective],
		['current_task', input.currentTask],
		['progress', input.progress],
		['blocker', input.blocker],
		['next_action', input.nextAction],
	];
	const merged: ContextItem[] = [];

	for (const [kind, content] of singletonInputs) {
		if (content === undefined) {
			const existing = active.filter((item) => item.kind === kind).at(-1);
			if (existing) {
				merged.push(existing);
			}
		} else if (content.trim()) {
			merged.push(newItem(kind, content, 'manual', projectId, createdAt, createId));
		}
	}

	const listInputs: Array<[ContextKind, string[] | undefined, ContextItem['source']]> = [
		['decision', input.decisions, 'manual'],
		['experiment', input.experiments, 'manual'],
		['discovery', input.discoveries, 'manual'],
	];
	for (const [kind, values, source] of listInputs) {
		const existing = active.filter((item) => item.kind === kind);
		merged.push(...existing);
		const known = new Set(existing.map((item) => item.content));
		for (const value of values ?? []) {
			const content = value.trim();
			if (content && !known.has(content)) {
				merged.push(newItem(kind, content, source, projectId, createdAt, createId));
				known.add(content);
			}
		}
	}

	const existingImportantFiles = active.filter((item) => item.kind === 'important_file');
	if (input.importantFiles === undefined) {
		merged.push(...existingImportantFiles);
	} else {
		const known = new Set<string>();
		for (const value of input.importantFiles) {
			const content = value.trim();
			if (content && !known.has(content)) {
				merged.push(newItem('important_file', content, 'deterministic', projectId, createdAt, createId));
				known.add(content);
			}
		}
	}

	const existingNotes = active.filter((item) => item.kind === 'note');
	if (input.chatReference === undefined) {
		merged.push(...existingNotes);
	} else if (input.chatReference.trim()) {
		merged.push(newItem('note', input.chatReference, 'deterministic', projectId, createdAt, createId));
	}

	return merged;
}

function newItem(
	kind: ContextKind,
	content: string,
	source: ContextItem['source'],
	projectId: string,
	createdAt: string,
	createId: () => string,
): ContextItem {
	return {
		id: createId(),
		projectId,
		kind,
		content: content.trim(),
		source,
		scope: kind === 'objective' ? 'project' : 'task',
		confidence: 1,
		createdAt,
		status: 'active',
	};
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
