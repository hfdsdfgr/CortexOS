CREATE UNIQUE INDEX runs_workspace_id ON execution_runs(workspace_id,id);
CREATE TABLE execution_layouts (
 run_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0),
 camera_json TEXT NOT NULL, target_json TEXT NOT NULL, updated_at TEXT NOT NULL,
 FOREIGN KEY(workspace_id,run_id) REFERENCES execution_runs(workspace_id,id)
);
