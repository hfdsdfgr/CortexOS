CREATE TABLE workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE conversations (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE(workspace_id,id)
);
CREATE TABLE execution_runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  assistant_message_id TEXT NOT NULL, model_id TEXT NOT NULL,
  model_config_json TEXT NOT NULL, context_manifest_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','completed','cancelled','failed','interrupted')),
  error_message TEXT, started_at TEXT NOT NULL, finished_at TEXT,
  FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id),
  FOREIGN KEY(workspace_id,conversation_id,assistant_message_id)
    REFERENCES messages(workspace_id,conversation_id,id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE(workspace_id,conversation_id,id)
);
CREATE UNIQUE INDEX one_active_generation ON execution_runs((1)) WHERE status='running';
CREATE TABLE messages (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
  seq INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')),
  content TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('completed','streaming','cancelled','failed','interrupted')),
  model_run_id TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id),
  FOREIGN KEY(workspace_id,conversation_id,model_run_id) REFERENCES execution_runs(workspace_id,conversation_id,id),
  UNIQUE(workspace_id,conversation_id,id), UNIQUE(conversation_id,seq)
);
CREATE TABLE execution_events (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES execution_runs(id), seq INTEGER NOT NULL,
  kind TEXT NOT NULL, occurred_at TEXT NOT NULL, payload_json TEXT NOT NULL,
  UNIQUE(run_id,seq)
);
CREATE TRIGGER immutable_execution_events_update BEFORE UPDATE ON execution_events
BEGIN SELECT RAISE(ABORT,'Execution events are immutable'); END;
CREATE TRIGGER immutable_execution_events_delete BEFORE DELETE ON execution_events
BEGIN SELECT RAISE(ABORT,'Execution events are immutable'); END;
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE INDEX conversations_workspace ON conversations(workspace_id,updated_at);
CREATE INDEX messages_conversation ON messages(workspace_id,conversation_id,seq);
