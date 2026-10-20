CREATE TABLE source_documents (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 canonical_path TEXT NOT NULL, name TEXT NOT NULL, latest_version INTEGER NOT NULL CHECK(latest_version>0),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), revision INTEGER NOT NULL CHECK(revision>0),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id,canonical_path), UNIQUE(workspace_id,id),
 FOREIGN KEY(id,latest_version) REFERENCES source_versions(source_id,version) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE source_versions (
 source_id TEXT NOT NULL REFERENCES source_documents(id), version INTEGER NOT NULL CHECK(version>0),
 content TEXT NOT NULL, content_hash TEXT NOT NULL, raw_hash TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(source_id,version)
);
CREATE TABLE source_events (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES source_documents(id),
 kind TEXT NOT NULL CHECK(kind IN ('imported','reimported','reauthorized','revoked')), created_at TEXT NOT NULL
);
CREATE TABLE knowledge_source_links (
 node_id TEXT NOT NULL, knowledge_version INTEGER NOT NULL,
 source_id TEXT NOT NULL, source_version INTEGER NOT NULL,
 start_line INTEGER NOT NULL CHECK(start_line>0), end_line INTEGER NOT NULL CHECK(end_line>=start_line),
 excerpt TEXT NOT NULL, PRIMARY KEY(node_id,knowledge_version),
 FOREIGN KEY(node_id,knowledge_version) REFERENCES knowledge_versions(node_id,version),
 FOREIGN KEY(source_id,source_version) REFERENCES source_versions(source_id,version)
);
CREATE TRIGGER source_link_scope BEFORE INSERT ON knowledge_source_links
WHEN NOT EXISTS (SELECT 1 FROM knowledge_nodes n JOIN source_documents s ON n.workspace_id=s.workspace_id WHERE n.id=NEW.node_id AND s.id=NEW.source_id)
BEGIN SELECT RAISE(ABORT,'Source workspace mismatch'); END;
CREATE TRIGGER source_version_update BEFORE UPDATE ON source_versions BEGIN SELECT RAISE(ABORT,'Source versions are immutable'); END;
CREATE TRIGGER source_version_delete BEFORE DELETE ON source_versions BEGIN SELECT RAISE(ABORT,'Source versions are immutable'); END;
CREATE TRIGGER source_link_update BEFORE UPDATE ON knowledge_source_links BEGIN SELECT RAISE(ABORT,'Source links are immutable'); END;
CREATE TRIGGER source_link_delete BEFORE DELETE ON knowledge_source_links BEGIN SELECT RAISE(ABORT,'Source links are immutable'); END;
CREATE TRIGGER source_event_update BEFORE UPDATE ON source_events BEGIN SELECT RAISE(ABORT,'Source events are immutable'); END;
CREATE TRIGGER source_event_delete BEFORE DELETE ON source_events BEGIN SELECT RAISE(ABORT,'Source events are immutable'); END;
CREATE TRIGGER source_identity_update BEFORE UPDATE OF workspace_id,canonical_path,name ON source_documents BEGIN SELECT RAISE(ABORT,'Source identity is immutable'); END;
CREATE INDEX source_workspace ON source_documents(workspace_id,updated_at);
CREATE INDEX source_links_document ON knowledge_source_links(source_id,node_id);
