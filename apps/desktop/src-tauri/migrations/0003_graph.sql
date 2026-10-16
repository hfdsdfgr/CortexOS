CREATE TABLE knowledge_edges (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 latest_version INTEGER NOT NULL CHECK(latest_version > 0),
 UNIQUE(workspace_id,id),
 FOREIGN KEY(id,latest_version) REFERENCES knowledge_edge_versions(edge_id,version) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE knowledge_edge_versions (
 edge_id TEXT NOT NULL, version INTEGER NOT NULL CHECK(version > 0), workspace_id TEXT NOT NULL,
 from_node_id TEXT NOT NULL, to_node_id TEXT NOT NULL,
 relation TEXT NOT NULL CHECK(relation IN ('supports','contradicts','depends_on','derived_from','revises')),
 active INTEGER NOT NULL CHECK(active IN (0,1)), change_reason TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(edge_id,version), CHECK(from_node_id<>to_node_id),
 FOREIGN KEY(workspace_id,edge_id) REFERENCES knowledge_edges(workspace_id,id),
 FOREIGN KEY(workspace_id,from_node_id) REFERENCES knowledge_nodes(workspace_id,id),
 FOREIGN KEY(workspace_id,to_node_id) REFERENCES knowledge_nodes(workspace_id,id)
);
CREATE TRIGGER immutable_knowledge_edges_update BEFORE UPDATE ON knowledge_edge_versions
BEGIN SELECT RAISE(ABORT,'Relationship versions are immutable'); END;
CREATE TRIGGER immutable_knowledge_edges_delete BEFORE DELETE ON knowledge_edge_versions
BEGIN SELECT RAISE(ABORT,'Relationship versions are immutable'); END;
CREATE TRIGGER immutable_edge_workspace BEFORE UPDATE OF workspace_id ON knowledge_edges
BEGIN SELECT RAISE(ABORT,'Relationship workspace is immutable'); END;
CREATE TABLE graph_layouts (
 workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), graph_kind TEXT NOT NULL CHECK(graph_kind='knowledge'),
 revision INTEGER NOT NULL CHECK(revision>0), camera_json TEXT NOT NULL, target_json TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE knowledge_positions (
 workspace_id TEXT NOT NULL, node_id TEXT NOT NULL, x REAL NOT NULL, y REAL NOT NULL, z REAL NOT NULL,
 PRIMARY KEY(workspace_id,node_id),
 FOREIGN KEY(workspace_id) REFERENCES graph_layouts(workspace_id),
 FOREIGN KEY(workspace_id,node_id) REFERENCES knowledge_nodes(workspace_id,id)
);
CREATE INDEX edges_workspace ON knowledge_edges(workspace_id);
