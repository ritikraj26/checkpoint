import * as vscode from 'vscode';

export class Logger implements vscode.Disposable {
	private readonly output = vscode.window.createOutputChannel('Checkpoint', { log: true });

	info(event: string, data: Record<string, boolean | number | string> = {}): void {
		this.output.info(JSON.stringify({ event, ...data }));
	}

	warn(event: string, data: Record<string, boolean | number | string> = {}): void {
		this.output.warn(JSON.stringify({ event, ...data }));
	}

	error(event: string, error: unknown): void {
		this.output.error(JSON.stringify({
			event,
			errorType: error instanceof Error ? error.name : typeof error,
		}));
	}

	show(): void {
		this.output.show(true);
	}

	dispose(): void {
		this.output.dispose();
	}
}