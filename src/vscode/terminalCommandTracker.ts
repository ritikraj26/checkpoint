import * as vscode from 'vscode';
import { RecentCommand } from '../domain/models';
import { redactCommand } from '../domain/redaction';

export class TerminalCommandTracker implements vscode.Disposable {
	private readonly commands: RecentCommand[] = [];
	private readonly subscription: vscode.Disposable;
	private readonly completionEmitter = new vscode.EventEmitter<void>();
	readonly onDidCompleteCommand = this.completionEmitter.event;

	constructor() {
		this.subscription = vscode.window.onDidEndTerminalShellExecution((event) => {
			this.completionEmitter.fire();
			const configuration = vscode.workspace.getConfiguration('checkpoint');
			if (!configuration.get<boolean>('captureTerminalCommands', false)) {
				return;
			}
			if (event.execution.commandLine.confidence === vscode.TerminalShellExecutionCommandLineConfidence.Low) {
				return;
			}
			const command = redactCommand(event.execution.commandLine.value.trim());
			if (!command) {
				return;
			}
			this.commands.push({
				command,
				cwd: event.execution.cwd?.toString(),
				exitCode: event.exitCode,
				endedAt: new Date().toISOString(),
			});
			this.trim();
		});
	}

	recent(): RecentCommand[] {
		this.trim();
		return [...this.commands];
	}

	dispose(): void {
		this.subscription.dispose();
		this.completionEmitter.dispose();
	}

	private trim(): void {
		const maximum = vscode.workspace.getConfiguration('checkpoint').get<number>('maxRecentCommands', 20);
		this.commands.splice(0, Math.max(0, this.commands.length - maximum));
	}
}
