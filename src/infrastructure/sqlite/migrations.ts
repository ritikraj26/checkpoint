export interface Migration {
	version: number;
	sql: string;
}

export const migrations: Migration[] = [
	{
		version: 1,
		sql: `
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    workspace_uri TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    started_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL,
    ended_at TEXT
);

CREATE TABLE context_items (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    scope TEXT NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    created_at TEXT NOT NULL,
    status TEXT NOT NULL
);

CREATE TABLE resources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    uri TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(project_id, uri)
);

CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    parent_checkpoint_id TEXT REFERENCES checkpoints(id),
    type TEXT NOT NULL CHECK (type IN ('manual', 'auto')),
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    git_state_json TEXT NOT NULL,
    workspace_state_json TEXT NOT NULL,
    UNIQUE(project_id, fingerprint)
);

CREATE TABLE checkpoint_context_items (
    checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
    context_item_id TEXT NOT NULL REFERENCES context_items(id) ON DELETE CASCADE,
    PRIMARY KEY(checkpoint_id, context_item_id)
);

CREATE TABLE checkpoint_resources (
    checkpoint_id TEXT NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
    resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    PRIMARY KEY(checkpoint_id, resource_id)
);

CREATE INDEX idx_sessions_project_started ON sessions(project_id, started_at DESC);
CREATE INDEX idx_checkpoints_project_created ON checkpoints(project_id, created_at DESC);
CREATE INDEX idx_context_project_kind_status ON context_items(project_id, kind, status);
CREATE INDEX idx_resources_project_created ON resources(project_id, created_at DESC);
`,
	},
];