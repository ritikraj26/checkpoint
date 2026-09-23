import * as vscode from 'vscode';
import { CheckpointManager } from './application/checkpointManager';
import { PortableCheckpointExporter } from './infrastructure/export/portableCheckpointExporter';
import { GitStateCollector } from './infrastructure/git/gitStateCollector';
import { SqliteCheckpointStore } from './infrastructure/sqlite/sqliteCheckpointStore';
import { CheckpointController } from './vscode/checkpointController';
import { Logger } from './vscode/logger';
import { TerminalCommandTracker } from './vscode/terminalCommandTracker';
import { WorkspaceStateCollector } from './vscode/workspaceStateCollector';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const logger = new Logger();
	try {
		await vscode.workspace.fs.createDirectory(context.globalStorageUri);
		const databasePath = vscode.Uri.joinPath(context.globalStorageUri, 'checkpoint.sqlite3').fsPath;
		const exportRoot = vscode.Uri.joinPath(context.globalStorageUri, 'exports').fsPath;
		const store = new SqliteCheckpointStore(databasePath);
		const exporter = new PortableCheckpointExporter(exportRoot);
		const tracker = new TerminalCommandTracker();
		const controller = new CheckpointController(
			context,
			store,
			new CheckpointManager(store, exporter),
			new GitStateCollector(),
			new WorkspaceStateCollector(tracker),
			tracker,
			exportRoot,
			logger,
		);
		context.subscriptions.push(logger, tracker, controller, { dispose: () => store.close() });
		await controller.initialize();
	} catch (error) {
		logger.error('extension.activationFailed', error);
		logger.show();
		void vscode.window.showErrorMessage('Checkpoint could not start. Run Checkpoint: Diagnostics after reloading VS Code.');
	}
}

export function deactivate() {}
