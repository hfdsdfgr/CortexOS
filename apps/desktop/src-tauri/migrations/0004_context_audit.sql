CREATE TABLE context_snapshots (
 run_id TEXT PRIMARY KEY REFERENCES execution_runs(id),
 request_json TEXT NOT NULL, request_hash TEXT NOT NULL,
 manifest_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE context_knowledge_items (
 run_id TEXT NOT NULL REFERENCES context_snapshots(run_id),
 ordinal INTEGER NOT NULL, node_id TEXT NOT NULL, version INTEGER NOT NULL,
 PRIMARY KEY(run_id,ordinal), UNIQUE(run_id,node_id),
 FOREIGN KEY(node_id,version) REFERENCES knowledge_versions(node_id,version)
);
CREATE TRIGGER context_item_scope BEFORE INSERT ON context_knowledge_items
WHEN NOT EXISTS (SELECT 1 FROM execution_runs r JOIN knowledge_nodes n ON n.workspace_id=r.workspace_id WHERE r.id=NEW.run_id AND n.id=NEW.node_id)
BEGIN SELECT RAISE(ABORT,'Context workspace mismatch'); END;
CREATE TRIGGER immutable_snapshot_update BEFORE UPDATE ON context_snapshots
BEGIN SELECT RAISE(ABORT,'Context snapshots are immutable'); END;
CREATE TRIGGER immutable_snapshot_delete BEFORE DELETE ON context_snapshots
BEGIN SELECT RAISE(ABORT,'Context snapshots are immutable'); END;
CREATE TRIGGER immutable_context_item_update BEFORE UPDATE ON context_knowledge_items
BEGIN SELECT RAISE(ABORT,'Context references are immutable'); END;
CREATE TRIGGER immutable_context_item_delete BEFORE DELETE ON context_knowledge_items
BEGIN SELECT RAISE(ABORT,'Context references are immutable'); END;
