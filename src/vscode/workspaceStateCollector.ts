import * as vscode from 'vscode';
import { WorkspaceState } from '../domain/models';
import { filterSafePaths, isSensitivePath } from '../domain/redaction';
import { TerminalCommandTracker } from './terminalCommandTracker';

export class WorkspaceStateCollector {
	constructor(private readonly commands: TerminalCommandTracker) {}

	collect(): WorkspaceState {
		const openFiles = vscode.window.tabGroups.all
			.flatMap((group) => group.tabs)
			.map((tab) => tab.input instanceof vscode.TabInputText ? serializeUri(tab.input.uri) : undefined)
			.filter((path): path is string => Boolean(path));
		const activeFile = vscode.window.activeTextEditor
			? serializeUri(vscode.window.activeTextEditor.document.uri)
			: undefined;
		const terminalCwds = vscode.window.terminals
			.map(terminalCwd)
			.filter((cwd): cwd is string => cwd !== undefined && !isSensitivePath(cwd));

		return {
			workspaceUris: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.toString()) ?? [],
			activeFile,
			openFiles: [...new Set(filterSafePaths(openFiles))],
			terminalCwds: [...new Set(terminalCwds)],
			recentCommands: this.commands.recent(),
		};
	}
}

function serializeUri(uri: vscode.Uri): string | undefined {
	if (isSensitivePath(uri.path)) {
		return undefined;
	}
	const folder = vscode.workspace.getWorkspaceFolder(uri);
	return folder ? vscode.workspace.asRelativePath(uri, false) : uri.toString();
}

function terminalCwd(terminal: vscode.Terminal): string | undefined {
	const integrated = terminal.shellIntegration?.cwd;
	if (integrated) {
		return integrated.toString();
	}
	const options = terminal.creationOptions;
	if ('cwd' in options && options.cwd) {
		return typeof options.cwd === 'string' ? options.cwd : options.cwd.toString();
	}
	return undefined;
}