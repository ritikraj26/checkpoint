import { buildResumeContext } from '../domain/checkpoint';
import { Checkpoint, ContextItem, Project } from '../domain/models';

export function renderResumeMarkdown(project: Project, checkpoint: Checkpoint): string {
	const context = buildResumeContext(project, checkpoint);
	const git = checkpoint.gitState;
	const lines = [
		`# Resume: ${project.name}`,
		'',
		`Checkpoint: ${formatDate(checkpoint.createdAt)} (${checkpoint.type})`,
		'',
		'## Goal',
		context.objective?.content ?? 'Not recorded.',
		'',
		'## Current task',
		context.currentTask?.content ?? 'Not recorded.',
		'',
		'## Current state',
		git.available
			? `Branch \`${git.branch ?? '(detached)'}\` at \`${git.commit?.slice(0, 12) ?? 'unknown'}\`; working tree ${git.isDirty ? 'has changes' : 'is clean'}.`
			: `Git state unavailable${git.error ? `: ${git.error}` : '.'}`,
		...section('Progress', context.progress),
		...changedFiles(checkpoint),
		...section('Important decisions', context.decisions),
		...section('What was tried', context.experiments),
		...section('Discoveries', context.discoveries),
		...section('Current blocker', context.blockers),
		...section('Relevant files', context.importantFiles),
		...resourceSection(context.resources),
		...section('Next action', context.nextActions),
	];

	return `${lines.join('\n').trim()}\n`;
}

function section(title: string, items: ContextItem[]): string[] {
	return ['', `## ${title}`, ...(items.length ? items.map((item) => `- ${item.content}`) : ['None recorded.'])];
}

function changedFiles(checkpoint: Checkpoint): string[] {
	const files = checkpoint.gitState.changedFiles;
	return ['', '## What changed', ...(files.length
		? files.map((file) => `- \`${file.status}\` ${file.path}`)
		: ['No working-tree changes recorded.'])];
}

function resourceSection(resources: Checkpoint['resources']): string[] {
	return ['', '## Relevant resources', ...(resources.length
		? resources.map((resource) => `- [${resource.title}](${resource.uri})${resource.notes ? `: ${resource.notes}` : ''}`)
		: ['None recorded.'])];
}

function formatDate(value: string): string {
	return new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}