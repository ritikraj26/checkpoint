import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ChangedFile, GitState } from '../../domain/models';
import { filterSafePaths } from '../../domain/redaction';

const execFileAsync = promisify(execFile);

export interface GitRunner {
	run(cwd: string, args: string[]): Promise<string>;
}

export class ProcessGitRunner implements GitRunner {
	async run(cwd: string, args: string[]): Promise<string> {
		const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
			encoding: 'utf8',
			maxBuffer: 1024 * 1024,
			timeout: 5_000,
		});
		return stdout;
	}
}

export class GitStateCollector {
	constructor(private readonly runner: GitRunner = new ProcessGitRunner()) {}

	async collect(workspacePath: string): Promise<GitState> {
		try {
			const repositoryRoot = (await this.runner.run(workspacePath, ['rev-parse', '--show-toplevel'])).trim();
			const [branch, commit, status] = await Promise.all([
				this.runner.run(repositoryRoot, ['branch', '--show-current']),
				this.runner.run(repositoryRoot, ['rev-parse', 'HEAD']),
				this.runner.run(repositoryRoot, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
			]);
			const changedFiles = parsePorcelainStatus(status);
			return {
				available: true,
				repositoryRoot,
				branch: branch.trim() || undefined,
				commit: commit.trim(),
				isDirty: changedFiles.length > 0,
				changedFiles,
				statusSummary: `${changedFiles.length} changed file${changedFiles.length === 1 ? '' : 's'}`,
			};
		} catch {
			return {
				available: false,
				isDirty: false,
				changedFiles: [],
				error: 'Git is unavailable or the workspace is not a repository.',
			};
		}
	}
}

export function parsePorcelainStatus(output: string): ChangedFile[] {
	const records = output.split('\0');
	const changedFiles: ChangedFile[] = [];
	for (let index = 0; index < records.length; index += 1) {
		const record = records[index];
		if (!record || record.length < 4) {
			continue;
		}
		const status = record.slice(0, 2);
		const path = record.slice(3);
		if (status.includes('R') || status.includes('C')) {
			index += 1;
		}
		if (filterSafePaths([path]).length) {
			changedFiles.push({ path, status });
		}
	}
	return changedFiles;
}