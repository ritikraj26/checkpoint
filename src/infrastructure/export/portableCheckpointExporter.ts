import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CheckpointExporter } from '../../application/checkpointManager';
import { renderResumeMarkdown } from '../../application/resumeRenderer';
import { buildResumeContext } from '../../domain/checkpoint';
import { Checkpoint, Project } from '../../domain/models';

export class PortableCheckpointExporter implements CheckpointExporter {
	constructor(private readonly exportRoot: string) {}

	async export(project: Project, checkpoint: Checkpoint): Promise<string> {
		const directory = join(this.exportRoot, project.id, checkpoint.id);
		await mkdir(directory, { recursive: true });
		const metadata = {
			schemaVersion: 1,
			project: {
				id: project.id,
				name: project.name,
				workspaceUri: project.workspaceUri,
			},
			checkpoint: {
				id: checkpoint.id,
				parentCheckpointId: checkpoint.parentCheckpointId,
				type: checkpoint.type,
				reason: checkpoint.reason,
				createdAt: checkpoint.createdAt,
				fingerprint: checkpoint.fingerprint,
			},
		};
		await Promise.all([
			atomicWrite(join(directory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`),
			atomicWrite(join(directory, 'context.json'), `${JSON.stringify(buildResumeContext(project, checkpoint), null, 2)}\n`),
			atomicWrite(join(directory, 'RESUME.md'), renderResumeMarkdown(project, checkpoint)),
		]);
		return directory;
	}
}

async function atomicWrite(path: string, content: string): Promise<void> {
	const temporaryPath = `${path}.${process.pid}.tmp`;
	await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
	await rename(temporaryPath, path);
}