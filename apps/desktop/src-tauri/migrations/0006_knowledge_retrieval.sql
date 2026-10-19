CREATE VIRTUAL TABLE knowledge_fts USING fts5(node_id UNINDEXED, workspace_id UNINDEXED, version UNINDEXED, title_terms, body_terms, tokenize='unicode61');
CREATE TABLE conversation_retrieval_settings (
 conversation_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 FOREIGN KEY(workspace_id,conversation_id) REFERENCES conversations(workspace_id,id)
);
CREATE TABLE retrieval_results (
 run_id TEXT NOT NULL REFERENCES execution_runs(id), ordinal INTEGER NOT NULL,
 node_id TEXT NOT NULL, version INTEGER NOT NULL, score REAL NOT NULL,
 included INTEGER NOT NULL CHECK(included IN (0,1)), reason TEXT NOT NULL,
 cost_units INTEGER NOT NULL CHECK(cost_units>=0),
 PRIMARY KEY(run_id,ordinal), UNIQUE(run_id,node_id),
 FOREIGN KEY(node_id,version) REFERENCES knowledge_versions(node_id,version)
);
CREATE TRIGGER retrieval_scope BEFORE INSERT ON retrieval_results
WHEN NOT EXISTS (SELECT 1 FROM execution_runs r JOIN knowledge_nodes n ON n.workspace_id=r.workspace_id WHERE r.id=NEW.run_id AND n.id=NEW.node_id)
BEGIN SELECT RAISE(ABORT,'Retrieval workspace mismatch'); END;
CREATE TRIGGER retrieval_immutable_update BEFORE UPDATE ON retrieval_results
BEGIN SELECT RAISE(ABORT,'Retrieval results are immutable'); END;
CREATE TRIGGER retrieval_immutable_delete BEFORE DELETE ON retrieval_results
BEGIN SELECT RAISE(ABORT,'Retrieval results are immutable'); END;
