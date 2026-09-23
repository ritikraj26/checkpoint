import * as vscode from 'vscode';
import { buildResumeContext } from '../domain/checkpoint';
import { Checkpoint, ContextItem, Project, Resource } from '../domain/models';

export interface ResumePanelActions {
	onRestoreWorkspace: () => void;
	onContinueInCodex: () => void;
}

export function showResumePanel(project: Project, checkpoint: Checkpoint, actions: ResumePanelActions): void {
	const panel = vscode.window.createWebviewPanel(
		'checkpoint.resume',
		`Resume: ${project.name}`,
		vscode.ViewColumn.Active,
		{ enableScripts: true },
	);
	panel.webview.html = resumeHtml(panel.webview, project, checkpoint);
	panel.webview.onDidReceiveMessage((message: { type?: string }) => {
		if (message.type === 'restore') {
			actions.onRestoreWorkspace();
			panel.dispose();
		} else if (message.type === 'codex') {
			actions.onContinueInCodex();
			panel.dispose();
		}
	});
}

function resumeHtml(webview: vscode.Webview, project: Project, checkpoint: Checkpoint): string {
	const nonce = randomNonce();
	const context = buildResumeContext(project, checkpoint);
	const git = checkpoint.gitState;
	const currentState = git.available
		? `Branch <code>${escapeHtml(git.branch ?? '(detached)')}</code> at <code>${escapeHtml(git.commit?.slice(0, 12) ?? 'unknown')}</code>. Working tree ${git.isDirty ? 'has changes' : 'is clean'}.`
		: 'Git state was unavailable.';
	return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Resume ${escapeHtml(project.name)}</title><style>
body { max-width: 820px; margin: 0 auto; padding: 30px 24px 70px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); line-height: 1.5; }
header { padding-bottom: 20px; border-bottom: 1px solid var(--vscode-widget-border); }
h1 { margin: 0 0 4px; font-size: 26px; letter-spacing: 0; } .meta { color: var(--vscode-descriptionForeground); }
section { padding: 18px 0; border-bottom: 1px solid var(--vscode-widget-border); } h2 { margin: 0 0 8px; font-size: 15px; letter-spacing: 0; } p, ul { margin: 0; } ul { padding-left: 20px; }
code { color: var(--vscode-textPreformat-foreground); background: var(--vscode-textCodeBlock-background); padding: 1px 4px; border-radius: 3px; }
.actions { position: sticky; bottom: 0; display: flex; gap: 8px; justify-content: flex-end; padding: 14px 0; background: var(--vscode-editor-background); }
button { border: 0; border-radius: 3px; padding: 8px 16px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; cursor: pointer; }
button:hover { background: var(--vscode-button-hoverBackground); }
.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style></head><body>
<header><h1>${escapeHtml(project.name)}</h1><div class="meta">${escapeHtml(new Date(checkpoint.createdAt).toLocaleString())}</div></header>
${textSection('Goal', context.objective?.content)}
${textSection('Current task', context.currentTask?.content)}
${textSection('Current state', currentState, true)}
${listSection('Progress', context.progress)}
${stringListSection('What changed', git.changedFiles.map((file) => `${file.status} ${file.path}`), true)}
${listSection('Important decisions', context.decisions)}
${listSection('What was tried', context.experiments)}
${listSection('Discoveries', context.discoveries)}
${listSection('Current blocker', context.blockers)}
${listSection('Relevant files', context.importantFiles)}
${resourceSection(context.resources)}
${listSection('Next action', context.nextActions)}
<div class="actions"><button class="secondary" id="restore">Restore workspace files</button><button id="codex">Continue in new Codex chat</button></div>
<script nonce="${nonce}">const vscode = acquireVsCodeApi(); document.getElementById('restore').addEventListener('click', () => vscode.postMessage({ type: 'restore' })); document.getElementById('codex').addEventListener('click', () => vscode.postMessage({ type: 'codex' }));</script>
</body></html>`;
}

function textSection(title: string, content?: string, trustedHtml = false): string {
	return `<section><h2>${escapeHtml(title)}</h2><p>${content ? (trustedHtml ? content : escapeHtml(content)) : 'Not recorded.'}</p></section>`;
}

function listSection(title: string, items: ContextItem[]): string {
	return stringListSection(title, items.map((item) => item.content));
}

function stringListSection(title: string, items: string[], code = false): string {
	const content = items.length
		? `<ul>${items.map((item) => `<li>${code ? `<code>${escapeHtml(item)}</code>` : escapeHtml(item)}</li>`).join('')}</ul>`
		: '<p>None recorded.</p>';
	return `<section><h2>${escapeHtml(title)}</h2>${content}</section>`;
}

function resourceSection(resources: Resource[]): string {
	const content = resources.length
		? `<ul>${resources.map((resource) => `<li>${escapeHtml(resource.title)}${resource.notes ? `: ${escapeHtml(resource.notes)}` : ''}<br><code>${escapeHtml(resource.uri)}</code></li>`).join('')}</ul>`
		: '<p>None recorded.</p>';
	return `<section><h2>Relevant resources</h2>${content}</section>`;
}

function randomNonce(): string {
	return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}
