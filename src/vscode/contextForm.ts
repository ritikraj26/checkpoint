import * as vscode from 'vscode';
import { ContextInput } from '../application/checkpointManager';
import { Checkpoint, ContextKind } from '../domain/models';

interface FormMessage {
	type: 'cancel' | 'submit';
	values?: Record<string, unknown>;
}

export async function collectContextInput(previous?: Checkpoint): Promise<ContextInput | undefined> {
	const panel = vscode.window.createWebviewPanel(
		'checkpoint.context',
		'Update Checkpoint Context',
		vscode.ViewColumn.Active,
		{ enableScripts: true },
	);
	panel.webview.html = formHtml(panel.webview, previous);

	return new Promise((resolve) => {
		let settled = false;
		const finish = (value: ContextInput | undefined): void => {
			if (settled) {
				return;
			}
			settled = true;
			resolve(value);
			panel.dispose();
		};
		panel.onDidDispose(() => finish(undefined));
		panel.webview.onDidReceiveMessage((message: FormMessage) => {
			if (message.type === 'cancel') {
				finish(undefined);
			} else if (message.type === 'submit' && message.values) {
				finish(parseValues(message.values));
			}
		});
	});
}

function parseValues(values: Record<string, unknown>): ContextInput {
	return {
		objective: field(values.objective),
		currentTask: field(values.currentTask),
		progress: field(values.progress),
		blocker: field(values.blocker),
		nextAction: field(values.nextAction),
		decisions: lines(values.decisions),
		experiments: lines(values.experiments),
		discoveries: lines(values.discoveries),
	};
}

function field(value: unknown): string {
	return typeof value === 'string' ? value.slice(0, 4_000) : '';
}

function lines(value: unknown): string[] {
	return field(value).split('\n').map((entry) => entry.trim()).filter(Boolean).slice(0, 100);
}

function formHtml(webview: vscode.Webview, previous?: Checkpoint): string {
	const nonce = randomNonce();
	const value = (kind: ContextKind): string => escapeHtml(
		previous?.contextItems.filter((item) => item.kind === kind && item.status === 'active').at(-1)?.content ?? '',
	);
	const values = (kind: ContextKind): string => escapeHtml(
		previous?.contextItems.filter((item) => item.kind === kind && item.status === 'active').map((item) => item.content).join('\n') ?? '',
	);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<title>Update Checkpoint Context</title>
<style>
body { max-width: 760px; margin: 0 auto; padding: 28px 24px 48px; color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
h1 { margin: 0 0 24px; font-size: 24px; font-weight: 600; letter-spacing: 0; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 20px; }
.field { display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.wide { grid-column: 1 / -1; }
label { font-size: 12px; font-weight: 600; color: var(--vscode-descriptionForeground); }
input, textarea { box-sizing: border-box; width: 100%; border: 1px solid var(--vscode-input-border, transparent); border-radius: 3px; padding: 8px 10px; color: var(--vscode-input-foreground); background: var(--vscode-input-background); font: inherit; letter-spacing: 0; }
textarea { min-height: 76px; resize: vertical; }
input:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
button { border: 0; border-radius: 3px; padding: 7px 14px; color: var(--vscode-button-foreground); background: var(--vscode-button-background); font: inherit; cursor: pointer; }
button:hover { background: var(--vscode-button-hoverBackground); }
button.secondary { color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); }
@media (max-width: 620px) { .grid { grid-template-columns: 1fr; } .wide { grid-column: auto; } }
</style>
</head>
<body>
<h1>Update checkpoint context</h1>
<form id="context-form">
<div class="grid">
<div class="field wide"><label for="objective">Objective</label><input id="objective" name="objective" maxlength="4000" value="${value('objective')}"></div>
<div class="field wide"><label for="currentTask">Current task</label><input id="currentTask" name="currentTask" maxlength="4000" value="${value('current_task')}"></div>
<div class="field"><label for="progress">Progress</label><textarea id="progress" name="progress" maxlength="4000">${value('progress')}</textarea></div>
<div class="field"><label for="nextAction">Next action</label><textarea id="nextAction" name="nextAction" maxlength="4000">${value('next_action')}</textarea></div>
<div class="field wide"><label for="blocker">Blocker</label><textarea id="blocker" name="blocker" maxlength="4000">${value('blocker')}</textarea></div>
<div class="field"><label for="decisions">Decisions</label><textarea id="decisions" name="decisions" maxlength="4000">${values('decision')}</textarea></div>
<div class="field"><label for="discoveries">Discoveries</label><textarea id="discoveries" name="discoveries" maxlength="4000">${values('discovery')}</textarea></div>
<div class="field wide"><label for="experiments">What was tried</label><textarea id="experiments" name="experiments" maxlength="4000">${values('experiment')}</textarea></div>
</div>
<div class="actions"><button class="secondary" type="button" id="cancel">Cancel</button><button type="submit">Save context and checkpoint</button></div>
</form>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
document.getElementById('cancel').addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
document.getElementById('context-form').addEventListener('submit', (event) => {
  event.preventDefault();
  vscode.postMessage({ type: 'submit', values: Object.fromEntries(new FormData(event.target).entries()) });
});
</script>
</body>
</html>`;
}

function randomNonce(): string {
	const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	return Array.from({ length: 32 }, () => characters[Math.floor(Math.random() * characters.length)]).join('');
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ?? character);
}
