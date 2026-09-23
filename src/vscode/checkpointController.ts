import { randomUUID } from 'node:crypto';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { AutoCheckpointScheduler } from '../application/autoCheckpointScheduler';
import { CheckpointManager, ContextInput } from '../application/checkpointManager';
import { CheckpointStore, CheckpointSummary } from '../application/checkpointStore';
import { renderCodexHandoffMarkdown } from '../application/resumeRenderer';
import { Checkpoint, Project, Resource, Session } from '../domain/models';
import { isSensitivePath } from '../domain/redaction';
import { chatDisplayDescription, CodexChat, CodexChatReader, CodexChatSnapshot } from '../infrastructure/codex/codexChatReader';
import { GitStateCollector } from '../infrastructure/git/gitStateCollector';
import { collectContextInput } from './contextForm';
import { Logger } from './logger';
import { showResumePanel } from './resumePanel';
import { TerminalCommandTracker } from './terminalCommandTracker';
import { WorkspaceStateCollector } from './workspaceStateCollector';

const pendingResumeKey = 'checkpoint.pendingResume';
const selectedChatKeyPrefix = 'checkpoint.selectedCodexChat.';

export class CheckpointController implements vscode.Disposable {
	private project?: Project;
	private session?: Session;
	private workspaceFolder?: vscode.WorkspaceFolder;
	private readonly disposables: vscode.Disposable[] = [];
	private readonly autoCheckpoint: AutoCheckpointScheduler;

	constructor(
		private readonly extensionContext: vscode.ExtensionContext,
		private readonly store: CheckpointStore,
		private readonly manager: CheckpointManager,
		private readonly git: GitStateCollector,
		private readonly workspace: WorkspaceStateCollector,
		private readonly terminalCommands: TerminalCommandTracker,
		private readonly codexChats: CodexChatReader,
		private readonly exportRoot: string,
		private readonly logger: Logger,
	) {
		this.autoCheckpoint = new AutoCheckpointScheduler(
			(reason) => this.saveAutomatically(reason),
			(error) => this.logger.error('checkpoint.autoSaveFailed', error),
		);
	}

	async initialize(): Promise<void> {
		await mkdir(this.extensionContext.globalStorageUri.fsPath, { recursive: true });
		this.refreshWorkspace();
		this.registerCommands();
		this.configureAutoCheckpoint();
		this.registerActivityTracking();
		this.scheduleBaselineIfNeeded();

		const pending = this.extensionContext.globalState.get<string>(pendingResumeKey);
		if (pending) {
			await this.extensionContext.globalState.update(pendingResumeKey, undefined);
			const checkpoint = this.store.getCheckpoint(pending);
			const project = checkpoint && this.store.listProjects().find((candidate) => candidate.id === checkpoint.projectId);
			if (project && checkpoint) {
				this.presentResume(project, checkpoint);
			}
		}
		this.logger.info('extension.initialized', { hasWorkspace: Boolean(this.workspaceFolder) });
	}

	dispose(): void {
		this.autoCheckpoint.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}

	private registerCommands(): void {
		this.register('checkpoint.save', () => this.save());
		this.register('checkpoint.selectChat', () => this.selectChat());
		this.register('checkpoint.updateContext', () => this.updateContext());
		this.register('checkpoint.resume', () => this.resume());
		this.register('checkpoint.history', () => this.history());
		this.register('checkpoint.addResource', () => this.addResource());
		this.register('checkpoint.showContext', () => this.showContext());
		this.register('checkpoint.diagnostics', () => this.diagnostics());
		this.register('checkpoint.backup', () => this.backup());
		this.register('checkpoint.deleteProject', () => this.deleteProject());
	}

	private registerActivityTracking(): void {
		this.disposables.push(
			vscode.workspace.onDidChangeTextDocument((event) => {
				if (this.isWorkspaceDocument(event.document)) {
					this.autoCheckpoint.recordActivity();
				}
			}),
			vscode.workspace.onDidSaveTextDocument((document) => {
				if (this.isWorkspaceDocument(document)) {
					this.autoCheckpoint.recordActivity();
				}
			}),
			vscode.window.onDidChangeActiveTextEditor((editor) => {
				if (editor && this.isWorkspaceDocument(editor.document)) {
					this.autoCheckpoint.recordActivity();
				}
			}),
			this.terminalCommands.onDidCompleteCommand(() => this.autoCheckpoint.recordActivity()),
			vscode.workspace.onDidChangeWorkspaceFolders(() => {
				this.refreshWorkspace();
				if (!this.scheduleBaselineIfNeeded()) {
					this.autoCheckpoint.recordActivity();
				}
			}),
			vscode.workspace.onDidChangeConfiguration((event) => {
				if (event.affectsConfiguration('checkpoint.autoCheckpoint')) {
					this.configureAutoCheckpoint();
					this.scheduleBaselineIfNeeded();
				}
			}),
		);
	}

	private register(command: string, action: () => Promise<void>): void {
		this.disposables.push(vscode.commands.registerCommand(command, async () => {
			try {
				await action();
			} catch (error) {
				this.logger.error(`${command}.failed`, error);
				void vscode.window.showErrorMessage(`Checkpoint failed: ${friendlyError(error)}`);
			}
		}));
	}

	private refreshWorkspace(): void {
		this.workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!this.workspaceFolder) {
			this.project = undefined;
			this.session = undefined;
			return;
		}
		const now = new Date().toISOString();
		this.project = this.store.upsertProject(this.workspaceFolder.uri.toString(), this.workspaceFolder.name, now);
		this.session = this.store.startSession(this.project.id, now);
	}

	private configureAutoCheckpoint(): void {
		const configuration = vscode.workspace.getConfiguration('checkpoint');
		this.autoCheckpoint.configure({
			enabled: configuration.get<boolean>('autoCheckpoint.enabled', true),
			idleMinutes: configuration.get<number>('autoCheckpoint.idleMinutes', 10),
		});
	}

	private scheduleBaselineIfNeeded(): boolean {
		if (!this.project) {
			return false;
		}
		if (!this.store.getLatestCheckpoint(this.project.id)) {
			this.autoCheckpoint.requestImmediate('Automatic facts-only baseline');
			return true;
		}
		return false;
	}

	private async save(): Promise<void> {
		const { project, session, folder } = this.requireWorkspace();
		const chat = await this.chatForSave(project, folder);
		if (!chat) {
			return;
		}
		await this.saveManualCheckpoint(
			project,
			session,
			folder,
			{ chatReference: chat.snapshot ? chatReference(chat.snapshot) : '' },
			'Manual checkpoint',
			chat.snapshot,
		);
	}

	private async updateContext(): Promise<void> {
		const { project, session, folder } = this.requireWorkspace();
		const previous = this.store.getLatestCheckpoint(project.id);
		const input = await collectContextInput(previous);
		if (!input) {
			return;
		}
		const chat = await this.captureSelectedChat(project, folder);
		if (chat) {
			input.chatReference = chatReference(chat);
		} else if (this.extensionContext.globalState.get<string>(selectedChatKey(project.id)) === 'none') {
			input.chatReference = '';
		}
		await this.saveManualCheckpoint(project, session, folder, input, 'Manual context update', chat);
	}

	private async saveManualCheckpoint(
		project: Project,
		session: Session,
		folder: vscode.WorkspaceFolder,
		input: ContextInput,
		reason: string,
		chat?: CodexChatSnapshot,
	): Promise<void> {
		const { state, importantFiles } = await this.captureState(folder);
		input.importantFiles = importantFiles;
		const result = await this.manager.save(project, session, state, input, 'manual', reason);
		const changedFileCount = state.gitState.changedFiles.length;
		this.logger.info('checkpoint.saved', { created: result.created, changedFiles: changedFileCount });
		if (result.exportError) {
			this.logger.warn('checkpoint.exportFailed');
			void vscode.window.showWarningMessage('Checkpoint saved, but its portable export could not be written.');
			return;
		}
		if (chat && result.exportDirectory) {
			await writeFile(join(result.exportDirectory, 'CHAT_CONTEXT.md'), chat.markdown, { encoding: 'utf8', mode: 0o600 });
		}
		const message = result.created
			? `Checkpoint saved${chat ? ` with chat context: ${chat.chat.title}` : ''}.`
			: 'No meaningful changes since the last checkpoint.';
		void vscode.window.showInformationMessage(message);
	}

	private async selectChat(): Promise<void> {
		const { project, folder } = this.requireWorkspace();
		const selection = await this.pickChat(folder);
		if (!selection) {
			return;
		}
		await this.extensionContext.globalState.update(selectedChatKey(project.id), selection.id);
		void vscode.window.showInformationMessage(selection.id === 'none'
			? 'Future checkpoints will save workspace state without chat context.'
			: `Future checkpoints will capture Codex chat: ${selection.chat?.title}`);
	}

	private async chatForSave(project: Project, folder: vscode.WorkspaceFolder): Promise<{ snapshot?: CodexChatSnapshot } | undefined> {
		const key = selectedChatKey(project.id);
		const selected = this.extensionContext.globalState.get<string>(key);
		if (selected === 'none') {
			return {};
		}
		const chats = await this.codexChats.listForWorkspace(folder.uri.fsPath);
		let chat = selected ? chats.find((candidate) => candidate.id === selected) : undefined;
		if (!chat) {
			if (selected) {
				void vscode.window.showWarningMessage('The previously selected Codex chat is no longer available. Select another chat for this checkpoint.');
			}
			const picked = await this.pickChat(folder, chats);
			if (!picked) {
				return undefined;
			}
			await this.extensionContext.globalState.update(key, picked.id);
			chat = picked.chat;
			if (!chat) {
				return {};
			}
		}
		return { snapshot: await this.codexChats.capture(chat) };
	}

	private async captureSelectedChat(project: Project, folder: vscode.WorkspaceFolder): Promise<CodexChatSnapshot | undefined> {
		const selected = this.extensionContext.globalState.get<string>(selectedChatKey(project.id));
		if (!selected || selected === 'none') {
			return undefined;
		}
		const chat = (await this.codexChats.listForWorkspace(folder.uri.fsPath)).find((candidate) => candidate.id === selected);
		return chat ? this.codexChats.capture(chat) : undefined;
	}

	private async pickChat(folder: vscode.WorkspaceFolder, knownChats?: CodexChat[]): Promise<{ id: string; chat?: CodexChat } | undefined> {
		const chats = knownChats ?? await this.codexChats.listForWorkspace(folder.uri.fsPath);
		const items: Array<vscode.QuickPickItem & { id: string; chat?: CodexChat }> = [
			{ label: '$(exclude) Save workspace only', description: 'Do not capture a Codex chat', id: 'none' },
			...chats.slice(0, 30).map((chat) => ({
				label: `$(comment-discussion) ${chat.title}`,
				description: chatDisplayDescription(chat),
				id: chat.id,
				chat,
			})),
		];
		return vscode.window.showQuickPick(items, {
			title: 'Select the Codex chat to save with this project',
			placeHolder: chats.length ? 'Choose a recent workspace chat' : 'No matching Codex chats found',
			matchOnDescription: true,
		});
	}

	private async saveAutomatically(reason: string): Promise<void> {
		if (!this.project || !this.session || !this.workspaceFolder) {
			return;
		}
		const project = this.project;
		const session = this.session;
		const folder = this.workspaceFolder;
		const { state, importantFiles } = await this.captureState(folder);
		const result = await this.manager.save(
			project,
			session,
			state,
			{ importantFiles },
			'auto',
			reason,
		);
		this.logger.info('checkpoint.autoSaved', {
			created: result.created,
			changedFiles: state.gitState.changedFiles.length,
		});
		if (result.exportError) {
			this.logger.warn('checkpoint.autoExportFailed');
		}
	}

	private async captureState(folder: vscode.WorkspaceFolder): Promise<{
		state: { gitState: Awaited<ReturnType<GitStateCollector['collect']>>; workspaceState: ReturnType<WorkspaceStateCollector['collect']> };
		importantFiles: string[];
	}> {
		const [gitState, workspaceState] = await Promise.all([
			this.git.collect(folder.uri.fsPath),
			Promise.resolve(this.workspace.collect()),
		]);
		const importantFiles = [...new Set([
			...gitState.changedFiles.map((file) => file.path),
			...workspaceState.openFiles,
			...(workspaceState.activeFile ? [workspaceState.activeFile] : []),
		])].sort();
		return { state: { gitState, workspaceState }, importantFiles };
	}

	private async resume(): Promise<void> {
		const project = await this.pickProject();
		if (!project) {
			return;
		}
		const checkpoint = await this.pickCheckpoint(project);
		if (!checkpoint) {
			return;
		}
		const currentWorkspace = this.workspaceFolder?.uri.toString();
		if (currentWorkspace !== project.workspaceUri) {
			await this.extensionContext.globalState.update(pendingResumeKey, checkpoint.id);
			await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.parse(project.workspaceUri), false);
			return;
		}
		this.presentResume(project, checkpoint);
	}

	private async history(): Promise<void> {
		const project = await this.pickProject();
		if (!project) {
			return;
		}
		const checkpoint = await this.pickCheckpoint(project);
		if (checkpoint) {
			this.presentResume(project, checkpoint);
		}
	}

	private async showContext(): Promise<void> {
		const project = this.project ?? await this.pickProject();
		if (!project) {
			return;
		}
		const checkpoint = this.store.getLatestCheckpoint(project.id);
		if (!checkpoint) {
			void vscode.window.showInformationMessage('No checkpoints exist for this project yet.');
			return;
		}
		this.presentResume(project, checkpoint);
	}

	private async addResource(): Promise<void> {
		const { project } = this.requireWorkspace();
		const uri = await vscode.window.showInputBox({ title: 'Add resource', prompt: 'URL or local path', ignoreFocusOut: true });
		if (!uri?.trim()) {
			return;
		}
		if (isSensitivePath(uri.trim())) {
			void vscode.window.showErrorMessage('Checkpoint will not store a resource that looks like a credential or secret file.');
			return;
		}
		const title = await vscode.window.showInputBox({ title: 'Resource title', value: uri.trim(), ignoreFocusOut: true });
		if (!title?.trim()) {
			return;
		}
		const notes = await vscode.window.showInputBox({ title: 'Resource notes', ignoreFocusOut: true });
		const resource: Resource = {
			id: randomUUID(),
			projectId: project.id,
			title: title.trim().slice(0, 500),
			uri: uri.trim().slice(0, 4_000),
			notes: notes?.trim().slice(0, 4_000),
			createdAt: new Date().toISOString(),
		};
		this.store.addResource(resource);
		this.autoCheckpoint.recordActivity();
		this.logger.info('resource.added');
		void vscode.window.showInformationMessage('Resource added to the current project.');
	}

	private async diagnostics(): Promise<void> {
		const diagnostics = this.store.diagnostics();
		const git = this.workspaceFolder ? await this.git.collect(this.workspaceFolder.uri.fsPath) : undefined;
		const document = await vscode.workspace.openTextDocument({
			language: 'json',
			content: `${JSON.stringify({
				status: 'ok',
				extensionVersion: this.extensionContext.extension.packageJSON.version,
				runtime: process.version,
				database: diagnostics,
				workspace: this.workspaceFolder?.uri.toString(),
				gitAvailable: git?.available ?? false,
				terminalCommandCapture: vscode.workspace.getConfiguration('checkpoint').get<boolean>('captureTerminalCommands', false),
				autoCheckpoint: this.autoCheckpoint.status(),
			}, null, 2)}\n`,
		});
		await vscode.window.showTextDocument(document, { preview: true });
	}

	private async backup(): Promise<void> {
		const destination = await vscode.window.showSaveDialog({
			title: 'Back Up Checkpoint Data',
			defaultUri: vscode.Uri.file(join(this.extensionContext.globalStorageUri.fsPath, `checkpoint-backup-${Date.now()}.sqlite3`)),
			filters: { 'SQLite database': ['sqlite3'] },
		});
		if (!destination) {
			return;
		}
		await this.store.backup(destination.fsPath);
		this.logger.info('database.backedUp');
		void vscode.window.showInformationMessage('Checkpoint data backed up.');
	}

	private async deleteProject(): Promise<void> {
		const project = await this.pickProject();
		if (!project) {
			return;
		}
		const confirmation = await vscode.window.showWarningMessage(
			`Delete all Checkpoint data for ${project.name}?`,
			{ modal: true },
			'Delete',
		);
		if (confirmation !== 'Delete') {
			return;
		}
		this.store.deleteProject(project.id);
		await rm(join(this.exportRoot, project.id), { recursive: true, force: true });
		if (this.project?.id === project.id) {
			this.refreshWorkspace();
		}
		this.logger.info('project.deleted');
		void vscode.window.showInformationMessage(`Deleted Checkpoint data for ${project.name}.`);
	}

	private presentResume(project: Project, checkpoint: Checkpoint): void {
		showResumePanel(project, checkpoint, {
			onRestoreWorkspace: () => void this.restoreWorkspaceState(checkpoint),
			onContinueInCodex: () => void this.continueInCodex(project, checkpoint),
		});
		this.logger.info('checkpoint.resumed');
	}

	private async continueInCodex(project: Project, checkpoint: Checkpoint): Promise<void> {
		try {
			const availableCommands = new Set(await vscode.commands.getCommands(true));
			const requiredCommands = ['chatgpt.newChat', 'chatgpt.addFileToThread'];
			if (requiredCommands.some((command) => !availableCommands.has(command))) {
				throw new Error('The Codex extension is not installed, enabled, or ready.');
			}

			const directory = join(this.exportRoot, project.id, checkpoint.id);
			const handoffPath = join(directory, 'CODEX_HANDOFF.md');
			await mkdir(directory, { recursive: true });
			await writeFile(handoffPath, renderCodexHandoffMarkdown(project, checkpoint), { encoding: 'utf8', mode: 0o600 });

			await this.restoreWorkspaceState(checkpoint);
			await vscode.commands.executeCommand('chatgpt.newChat');
			await delay(500);
			await vscode.commands.executeCommand('chatgpt.addFileToThread', vscode.Uri.file(handoffPath));
			const chatContextPath = await this.findChatContext(checkpoint);
			if (chatContextPath) {
				await vscode.commands.executeCommand('chatgpt.addFileToThread', vscode.Uri.file(chatContextPath));
			}
			this.logger.info('checkpoint.codexHandoffPrepared');
			void vscode.window.showInformationMessage(
				chatContextPath
					? 'Checkpoint and saved chat context are attached to a new Codex chat. Press Send to begin.'
					: 'Checkpoint context is attached to a new Codex chat. Press Send to begin.',
			);
		} catch (error) {
			this.logger.error('checkpoint.codexHandoffFailed', error);
			void vscode.window.showErrorMessage(`Could not prepare a new Codex chat: ${friendlyError(error)}`);
		}
	}

	private async findChatContext(checkpoint: Checkpoint): Promise<string | undefined> {
		let current: Checkpoint | undefined = checkpoint;
		while (current) {
			const path = join(this.exportRoot, current.projectId, current.id, 'CHAT_CONTEXT.md');
			try {
				await access(path);
				return path;
			} catch {
				current = current.parentCheckpointId ? this.store.getCheckpoint(current.parentCheckpointId) : undefined;
			}
		}
		return undefined;
	}

	private async restoreWorkspaceState(checkpoint: Checkpoint): Promise<void> {
		const folder = vscode.workspace.workspaceFolders?.[0];
		if (!folder) {
			return;
		}
		for (const path of checkpoint.workspaceState.openFiles.slice(0, 20)) {
			try {
				const uri = path.includes('://') ? vscode.Uri.parse(path) : vscode.Uri.joinPath(folder.uri, path);
				const document = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
			} catch {
				this.logger.warn('resume.fileUnavailable');
			}
		}
		if (checkpoint.workspaceState.activeFile) {
			try {
				const path = checkpoint.workspaceState.activeFile;
				const uri = path.includes('://') ? vscode.Uri.parse(path) : vscode.Uri.joinPath(folder.uri, path);
				await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { preview: false });
			} catch {
				this.logger.warn('resume.activeFileUnavailable');
			}
		}
	}

	private async pickProject(): Promise<Project | undefined> {
		const projects = this.store.listProjects();
		if (!projects.length) {
			void vscode.window.showInformationMessage('No Checkpoint projects have been recorded.');
			return undefined;
		}
		if (projects.length === 1) {
			return projects[0];
		}
		const picked = await vscode.window.showQuickPick(
			projects.map((project) => ({ label: project.name, description: project.workspaceUri, project })),
			{ title: 'Select project', matchOnDescription: true },
		);
		return picked?.project;
	}

	private async pickCheckpoint(project: Project): Promise<Checkpoint | undefined> {
		const summaries = this.store.listCheckpoints(project.id);
		if (!summaries.length) {
			void vscode.window.showInformationMessage(`No checkpoints exist for ${project.name}.`);
			return undefined;
		}
		const picked = await vscode.window.showQuickPick(
			summaries.map((summary) => checkpointItem(summary)),
			{ title: `Checkpoint history: ${project.name}` },
		);
		return picked ? this.store.getCheckpoint(picked.checkpointId) : undefined;
	}

	private requireWorkspace(): { project: Project; session: Session; folder: vscode.WorkspaceFolder } {
		if (!this.project || !this.session || !this.workspaceFolder) {
			throw new Error('Open a workspace folder before using this command.');
		}
		return { project: this.project, session: this.session, folder: this.workspaceFolder };
	}

	private isWorkspaceDocument(document: vscode.TextDocument): boolean {
		return document.uri.scheme === 'file' && Boolean(vscode.workspace.getWorkspaceFolder(document.uri));
	}
}

function checkpointItem(summary: CheckpointSummary): vscode.QuickPickItem & { checkpointId: string } {
	return {
		label: new Date(summary.createdAt).toLocaleString(),
		description: summary.branch ? `$(git-branch) ${summary.branch}` : undefined,
		detail: `${summary.reason} | ${summary.changedFileCount} changed file${summary.changedFileCount === 1 ? '' : 's'}`,
		checkpointId: summary.id,
	};
}

function friendlyError(error: unknown): string {
	return error instanceof Error ? error.message : 'Unknown error';
}

function selectedChatKey(projectId: string): string {
	return `${selectedChatKeyPrefix}${projectId}`;
}

function chatReference(snapshot: CodexChatSnapshot): string {
	return `codex-chat:${snapshot.chat.id}:${snapshot.digest}`;
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
