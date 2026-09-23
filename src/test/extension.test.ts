import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

suite('Checkpoint extension', () => {
	test('activates the vertical slice and exposes diagnostics', async () => {
		const extension = vscode.extensions.all.find((candidate) => candidate.packageJSON.name === 'checkpoint');
		assert.ok(extension, 'Checkpoint extension was not discovered by the extension host.');

		await extension.activate();
		assert.equal(extension.isActive, true);

		const commands = await vscode.commands.getCommands(true);
		for (const command of [
			'checkpoint.save',
			'checkpoint.resume',
			'checkpoint.history',
			'checkpoint.addResource',
			'checkpoint.showContext',
			'checkpoint.diagnostics',
			'checkpoint.backup',
			'checkpoint.deleteProject',
		]) {
			assert.ok(commands.includes(command), `${command} was not registered.`);
		}

		await vscode.commands.executeCommand('checkpoint.diagnostics');
		const diagnostics = vscode.window.activeTextEditor?.document.getText();

		assert.ok(diagnostics);
		const parsed = JSON.parse(diagnostics) as {
			status: string;
			extensionVersion: string;
			autoCheckpoint: { enabled: boolean; idleMinutes: number };
		};
		assert.equal(parsed.status, 'ok');
		assert.equal(parsed.extensionVersion, '0.2.0');
		assert.equal(parsed.autoCheckpoint.enabled, true);
		assert.equal(parsed.autoCheckpoint.idleMinutes, 10);
	});
});
