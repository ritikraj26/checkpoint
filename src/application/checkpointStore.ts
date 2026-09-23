import { Checkpoint, Project, Resource, Session } from '../domain/models';

export interface CheckpointSummary {
	id: string;
	projectId: string;
	type: Checkpoint['type'];
	reason: string;
	createdAt: string;
	branch?: string;
	changedFileCount: number;
	fingerprint: string;
}

export interface SaveCheckpointResult {
	checkpoint: Checkpoint;
	created: boolean;
}

export interface StoreDiagnostics {
	databasePath: string;
	schemaVersion: number;
	projectCount: number;
	checkpointCount: number;
}

export interface CheckpointStore {
	upsertProject(workspaceUri: string, name: string, now: string): Project;
	listProjects(): Project[];
	startSession(projectId: string, now: string): Session;
	saveCheckpoint(checkpoint: Checkpoint): SaveCheckpointResult;
	listCheckpoints(projectId: string): CheckpointSummary[];
	getCheckpoint(id: string): Checkpoint | undefined;
	getLatestCheckpoint(projectId: string): Checkpoint | undefined;
	addResource(resource: Resource): void;
	listResources(projectId: string): Resource[];
	deleteProject(projectId: string): void;
	backup(destination: string): Promise<void>;
	diagnostics(): StoreDiagnostics;
	close(): void;
}