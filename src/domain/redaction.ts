const sensitiveFilePatterns = [
	/(^|\/)\.env(?:\.|$)/i,
	/(^|\/)(?:id_rsa|id_ed25519|credentials|secrets?)(?:\.|$)/i,
	/(^|\/)\.npmrc$/i,
	/(^|\/)\.pypirc$/i,
];

const sensitiveAssignment = /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)=(?:"[^"]*"|'[^']*'|[^\s"']+)/gi;
const sensitiveFlag = /(\s--?(?:password|passwd|token|secret|api[-_]?key)(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi;
const credentialUrl = /(https?:\/\/[^\s/:]+:)[^\s@]+@/gi;
const authorizationHeader = /(\b(?:authorization|proxy-authorization):\s*(?:bearer|basic)\s+)[^\s"']+/gi;
const sensitiveQuery = /([?&](?:access_token|api_key|token|key|secret|password)=)[^\s&#"']+/gi;

export function isSensitivePath(path: string): boolean {
	return sensitiveFilePatterns.some((pattern) => pattern.test(path));
}

export function filterSafePaths(paths: string[]): string[] {
	return paths.filter((path) => !isSensitivePath(path));
}

export function redactCommand(command: string): string {
	return command
		.replace(sensitiveAssignment, '$1=[REDACTED]')
		.replace(sensitiveFlag, '$1[REDACTED]')
		.replace(credentialUrl, '$1[REDACTED]@')
		.replace(authorizationHeader, '$1[REDACTED]')
		.replace(sensitiveQuery, '$1[REDACTED]');
}