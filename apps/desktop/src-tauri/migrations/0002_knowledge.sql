CREATE TABLE knowledge_nodes (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 latest_version INTEGER NOT NULL CHECK(latest_version > 0), effective_version INTEGER,
 revision INTEGER NOT NULL CHECK(revision > 0), created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 source_conversation_id TEXT, source_message_id TEXT, source_excerpt TEXT, source_hash TEXT,
 UNIQUE(workspace_id,id),
 CHECK((source_message_id IS NULL AND source_conversation_id IS NULL AND source_excerpt IS NULL AND source_hash IS NULL)
 OR (source_message_id IS NOT NULL AND source_conversation_id IS NOT NULL AND source_excerpt IS NOT NULL AND source_hash IS NOT NULL)),
 FOREIGN KEY(workspace_id,source_conversation_id,source_message_id) REFERENCES messages(workspace_id,conversation_id,id),
 FOREIGN KEY(id,latest_version) REFERENCES knowledge_versions(node_id,version) DEFERRABLE INITIALLY DEFERRED,
 FOREIGN KEY(id,effective_version) REFERENCES knowledge_versions(node_id,version) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE knowledge_versions (
 node_id TEXT NOT NULL REFERENCES knowledge_nodes(id), version INTEGER NOT NULL CHECK(version > 0),
 title TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('context','knowledge','hypothesis','decision','evidence','conflict')),
 content TEXT NOT NULL, author TEXT NOT NULL CHECK(author='user'), change_reason TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(node_id,version)
);
CREATE TABLE knowledge_approval_events (
 id TEXT PRIMARY KEY, node_id TEXT NOT NULL, version INTEGER NOT NULL,
 actor TEXT NOT NULL CHECK(actor='user'), created_at TEXT NOT NULL,
 FOREIGN KEY(node_id,version) REFERENCES knowledge_versions(node_id,version), UNIQUE(node_id,version)
);
CREATE TRIGGER immutable_knowledge_versions_update BEFORE UPDATE ON knowledge_versions
BEGIN SELECT RAISE(ABORT,'Knowledge versions are immutable'); END;
CREATE TRIGGER immutable_knowledge_versions_delete BEFORE DELETE ON knowledge_versions
BEGIN SELECT RAISE(ABORT,'Knowledge versions are immutable'); END;
CREATE TRIGGER immutable_knowledge_approvals_update BEFORE UPDATE ON knowledge_approval_events
BEGIN SELECT RAISE(ABORT,'Knowledge approvals are immutable'); END;
CREATE TRIGGER immutable_knowledge_approvals_delete BEFORE DELETE ON knowledge_approval_events
BEGIN SELECT RAISE(ABORT,'Knowledge approvals are immutable'); END;
CREATE TRIGGER immutable_knowledge_origin BEFORE UPDATE OF workspace_id,source_conversation_id,source_message_id,source_excerpt,source_hash ON knowledge_nodes
BEGIN SELECT RAISE(ABORT,'Knowledge origin is immutable'); END;
CREATE INDEX knowledge_workspace ON knowledge_nodes(workspace_id,updated_at);
