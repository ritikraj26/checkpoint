export const contextKinds = [
	'objective',
	'current_task',
	'progress',
	'decision',
	'experiment',
	'discovery',
	'blocker',
	'next_action',
	'important_file',
	'note',
] as const;

export type ContextKind = typeof contextKinds[number];
export type ContextScope = 'project' | 'task' | 'session';
export type ContextSource = 'manual' | 'deterministic' | 'ai';
export type CheckpointType = 'manual' | 'auto';

export interface Project {
	id: string;
	name: string;
	workspaceUri: string;
	createdAt: string;
	updatedAt: string;
}

export interface Session {
	id: string;
	projectId: string;
	startedAt: string;
	lastActivityAt: string;
	endedAt?: string;
}

export interface ContextItem {
	id: string;
	projectId: string;
	kind: ContextKind;
	content: string;
	source: ContextSource;
	scope: ContextScope;
	confidence: number;
	createdAt: string;
	status: 'active' | 'resolved' | 'superseded';
}

export interface Resource {
	id: string;
	projectId: string;
	title: string;
	uri: string;
	notes?: string;
	createdAt: string;
}

export interface ChangedFile {
	path: string;
	status: string;
}

export interface GitState {
	available: boolean;
	repositoryRoot?: string;
	branch?: string;
	commit?: string;
	isDirty: boolean;
	changedFiles: ChangedFile[];
	statusSummary?: string;
	error?: string;
}

export interface RecentCommand {
	command: string;
	cwd?: string;
	exitCode?: number;
	endedAt: string;
}

export interface WorkspaceState {
	workspaceUris: string[];
	activeFile?: string;
	openFiles: string[];
	terminalCwds: string[];
	recentCommands: RecentCommand[];
}

export interface CheckpointDraft {
	id: string;
	projectId: string;
	sessionId: string;
	parentCheckpointId?: string;
	type: CheckpointType;
	reason: string;
	createdAt: string;
	gitState: GitState;
	workspaceState: WorkspaceState;
	contextItems: ContextItem[];
	resources: Resource[];
}

export interface Checkpoint extends CheckpointDraft {
	fingerprint: string;
}

export interface ResumeContext {
	project: Project;
	checkpoint: Checkpoint;
	currentTask?: ContextItem;
	objective?: ContextItem;
	progress: ContextItem[];
	decisions: ContextItem[];
	experiments: ContextItem[];
	discoveries: ContextItem[];
	blockers: ContextItem[];
	nextActions: ContextItem[];
	importantFiles: ContextItem[];
	resources: Resource[];
}

export interface ContextSummarizer {
	summarize(context: ResumeContext, signal?: AbortSignal): Promise<string>;
}