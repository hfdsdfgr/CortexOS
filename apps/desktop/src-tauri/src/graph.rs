use crate::{
    db::Database,
    knowledge::{COLUMNS, KnowledgeNode, node},
    models::{AppResult, new_id, now},
};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodePosition {
    pub node_id: String,
    pub position: [f64; 3],
}
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EdgeVersion {
    pub version: i64,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub active: bool,
    pub change_reason: String,
    pub created_at: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub id: String,
    pub versions: Vec<EdgeVersion>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphView {
    pub revision: i64,
    pub camera: [f64; 3],
    pub target: [f64; 3],
    pub positions: Vec<NodePosition>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeGraph {
    pub nodes: Vec<KnowledgeNode>,
    pub edges: Vec<GraphEdge>,
    pub view: GraphView,
}
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveEdge {
    pub workspace_id: String,
    pub edge_id: Option<String>,
    pub expected_version: Option<i64>,
    pub from_node_id: String,
    pub to_node_id: String,
    pub relation: String,
    pub active: bool,
    pub change_reason: String,
}
#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveGraphView {
    pub workspace_id: String,
    pub expected_revision: i64,
    pub camera: [f64; 3],
    pub target: [f64; 3],
    pub positions: Vec<NodePosition>,
}
fn error(_: rusqlite::Error) -> String {
    "图谱数据读写失败，请保留编辑并重试。".into()
}
fn missing() -> String {
    "对象不存在，或不属于当前工作区。".into()
}
fn finite(position: &[f64; 3]) -> bool {
    position
        .iter()
        .all(|v| v.is_finite() && v.abs() <= 100000.0)
}
impl Database {
    pub fn knowledge_graph(&self, workspace: &str) -> AppResult<KnowledgeGraph> {
        let connection = self.connection()?;
        let exists: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=?1)",
                params![workspace],
                |r| r.get(0),
            )
            .map_err(error)?;
        if !exists {
            return Err(missing());
        }
        let mut statement = connection.prepare(&format!("SELECT {COLUMNS} FROM knowledge_nodes n JOIN knowledge_versions v ON v.node_id=n.id AND v.version=n.latest_version WHERE n.workspace_id=?1 ORDER BY n.created_at,n.id")).map_err(error)?;
        let nodes = statement
            .query_map(params![workspace], node)
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        let edges = {
            let mut statement = connection.prepare("SELECT e.id,v.version,v.from_node_id,v.to_node_id,v.relation,v.active,v.change_reason,v.created_at FROM knowledge_edges e LEFT JOIN knowledge_edge_versions v ON v.edge_id=e.id AND v.workspace_id=e.workspace_id WHERE e.workspace_id=?1 ORDER BY e.id,v.version DESC").map_err(error)?;
            let mut rows = statement.query(params![workspace]).map_err(error)?;
            let mut edges: Vec<GraphEdge> = Vec::new();
            while let Some(row) = rows.next().map_err(error)? {
                let id: String = row.get(0).map_err(error)?;
                if edges.last().map(|edge| edge.id.as_str()) != Some(id.as_str()) {
                    edges.push(GraphEdge {
                        id,
                        versions: Vec::new(),
                    });
                }
                if let Some(version) = row.get::<_, Option<i64>>(1).map_err(error)? {
                    edges.last_mut().unwrap().versions.push(EdgeVersion {
                        version,
                        from_node_id: row.get(2).map_err(error)?,
                        to_node_id: row.get(3).map_err(error)?,
                        relation: row.get(4).map_err(error)?,
                        active: row.get(5).map_err(error)?,
                        change_reason: row.get(6).map_err(error)?,
                        created_at: row.get(7).map_err(error)?,
                    });
                }
            }
            edges
        };
        let stored: Option<(i64, String, String)> = connection
            .query_row(
                "SELECT revision,camera_json,target_json FROM graph_layouts WHERE workspace_id=?1",
                params![workspace],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .optional()
            .map_err(error)?;
        let (revision, camera, target) = match stored {
            Some((revision, camera, target)) => (
                revision,
                serde_json::from_str(&camera).map_err(|_| "图谱视角格式异常。".to_string())?,
                serde_json::from_str(&target).map_err(|_| "图谱视角格式异常。".to_string())?,
            ),
            None => (0, [0.0, 8.0, 20.0], [0.0, 0.0, 0.0]),
        };
        let mut statement=connection.prepare("SELECT node_id,x,y,z FROM knowledge_positions WHERE workspace_id=?1 ORDER BY node_id").map_err(error)?;
        let positions = statement
            .query_map(params![workspace], |r| {
                Ok(NodePosition {
                    node_id: r.get(0)?,
                    position: [r.get(1)?, r.get(2)?, r.get(3)?],
                })
            })
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        Ok(KnowledgeGraph {
            nodes,
            edges,
            view: GraphView {
                revision,
                camera,
                target,
                positions,
            },
        })
    }
    pub fn save_knowledge_edge(&self, input: SaveEdge) -> AppResult<String> {
        if input.from_node_id == input.to_node_id
            || ![
                "supports",
                "contradicts",
                "depends_on",
                "derived_from",
                "revises",
            ]
            .contains(&input.relation.as_str())
        {
            return Err("请选择不同的起点、终点与有效关系类型。".into());
        }
        let reason = input.change_reason.trim();
        if reason.is_empty() || reason.chars().count() > 500 || reason.contains('\0') {
            return Err("请填写 1–500 字关系修改说明。".into());
        }
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(error)?;
        let count: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM knowledge_nodes WHERE workspace_id=?1 AND id IN (?2,?3)",
                params![input.workspace_id, input.from_node_id, input.to_node_id],
                |r| r.get(0),
            )
            .map_err(error)?;
        if count != 2 {
            return Err(missing());
        }
        let (id, version) = match input.edge_id.as_ref() {
            Some(id) => {
                let current:Option<i64>=tx.query_row("SELECT latest_version FROM knowledge_edges WHERE workspace_id=?1 AND id=?2",params![input.workspace_id,id],|r|r.get(0)).optional().map_err(error)?;
                let current = current.ok_or_else(missing)?;
                if Some(current) != input.expected_version {
                    return Err("关系已被另一处修改。你的编辑已保留，请读取最新关系并比较。".into());
                }
                let same:bool=tx.query_row("SELECT from_node_id=?3 AND to_node_id=?4 AND relation=?5 AND active=?6 FROM knowledge_edge_versions WHERE edge_id=?1 AND version=?2",params![id,current,input.from_node_id,input.to_node_id,input.relation,input.active],|r|r.get(0)).map_err(error)?;
                if same {
                    return Err("关系没有变化，无需保存新修订。".into());
                }
                (id.clone(), current + 1)
            }
            None => {
                if input.expected_version.is_some() || !input.active {
                    return Err("新关系须为有效关系。".into());
                }
                (new_id(), 1)
            }
        };
        if input.active {
            let duplicate:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM knowledge_edges e JOIN knowledge_edge_versions v ON v.edge_id=e.id AND v.version=e.latest_version WHERE e.workspace_id=?1 AND e.id<>?2 AND v.from_node_id=?3 AND v.to_node_id=?4 AND v.relation=?5 AND v.active=1)",params![input.workspace_id,id,input.from_node_id,input.to_node_id,input.relation],|r|r.get(0)).map_err(error)?;
            if duplicate {
                return Err("这条有效关系已经存在。".into());
            }
        }
        if version == 1 {
            tx.execute(
                "INSERT INTO knowledge_edges VALUES(?1,?2,1)",
                params![id, input.workspace_id],
            )
            .map_err(error)?;
        } else {
            tx.execute(
                "UPDATE knowledge_edges SET latest_version=?2 WHERE id=?1",
                params![id, version],
            )
            .map_err(error)?;
        }
        tx.execute(
            "INSERT INTO knowledge_edge_versions VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![
                id,
                version,
                input.workspace_id,
                input.from_node_id,
                input.to_node_id,
                input.relation,
                input.active,
                reason,
                now()
            ],
        )
        .map_err(error)?;
        tx.commit().map_err(error)?;
        Ok(id)
    }
    pub fn save_graph_view(&self, input: SaveGraphView) -> AppResult<i64> {
        let mut seen = HashSet::new();
        let distance: f64 = input
            .camera
            .iter()
            .zip(input.target)
            .map(|(a, b)| (a - b).powi(2))
            .sum();
        if input.expected_revision < 0
            || !finite(&input.camera)
            || !finite(&input.target)
            || distance < 0.01
            || input.positions.len() > 1000
            || input
                .positions
                .iter()
                .any(|p| !finite(&p.position) || !seen.insert(&p.node_id))
        {
            return Err("布局参数无效；坐标需有限，节点不可重复，最多保存 1000 个位置。".into());
        }
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(error)?;
        let exists: bool = tx
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=?1)",
                params![input.workspace_id],
                |r| r.get(0),
            )
            .map_err(error)?;
        if !exists {
            return Err(missing());
        }
        let current: i64 = tx
            .query_row(
                "SELECT revision FROM graph_layouts WHERE workspace_id=?1",
                params![input.workspace_id],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?
            .unwrap_or(0);
        if current != input.expected_revision {
            return Err("视图已被另一处保存。当前布局已保留，请重新读取后再调整。".into());
        }
        for position in &input.positions {
            let exists: bool = tx
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM knowledge_nodes WHERE workspace_id=?1 AND id=?2)",
                    params![input.workspace_id, position.node_id],
                    |r| r.get(0),
                )
                .map_err(error)?;
            if !exists {
                return Err(missing());
            }
        }
        tx.execute("INSERT INTO graph_layouts VALUES(?1,'knowledge',?2,?3,?4,?5) ON CONFLICT(workspace_id) DO UPDATE SET revision=excluded.revision,camera_json=excluded.camera_json,target_json=excluded.target_json,updated_at=excluded.updated_at",params![input.workspace_id,current+1,serde_json::to_string(&input.camera).unwrap(),serde_json::to_string(&input.target).unwrap(),now()]).map_err(error)?;
        for position in input.positions {
            tx.execute("INSERT INTO knowledge_positions VALUES(?1,?2,?3,?4,?5) ON CONFLICT(workspace_id,node_id) DO UPDATE SET x=excluded.x,y=excluded.y,z=excluded.z",params![input.workspace_id,position.node_id,position.position[0],position.position[1],position.position[2]]).map_err(error)?;
        }
        tx.commit().map_err(error)?;
        Ok(current + 1)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::SaveKnowledge;
    fn create(db: &Database, workspace: &str, title: &str) -> String {
        db.save_knowledge(SaveKnowledge {
            workspace_id: workspace.into(),
            node_id: None,
            expected_revision: None,
            title: title.into(),
            kind: "knowledge".into(),
            content: title.into(),
            change_reason: "测试".into(),
            source_message_id: None,
            source_excerpt: None,
        })
        .unwrap()
    }
    #[test]
    fn graph_history_scope_layout_and_transactions() {
        let directory = std::env::temp_dir().join(format!("cortexos-graph-{}", new_id()));
        let workspace;
        let a;
        let b;
        let edge_id;
        {
            let db = Database::open(&directory).unwrap();
            workspace = db.create_workspace("A").unwrap().id;
            let other = db.create_workspace("B").unwrap().id;
            a = create(&db, &workspace, "A");
            b = create(&db, &workspace, "B");
            let foreign = create(&db, &other, "C");
            let mut edge = SaveEdge {
                workspace_id: workspace.clone(),
                edge_id: None,
                expected_version: None,
                from_node_id: a.clone(),
                to_node_id: b.clone(),
                relation: "supports".into(),
                active: true,
                change_reason: "依据关系".into(),
            };
            edge_id = db.save_knowledge_edge(edge.clone()).unwrap();
            assert!(db.save_knowledge_edge(edge.clone()).is_err());
            edge.edge_id = Some(edge_id.clone());
            edge.expected_version = Some(1);
            edge.relation = "depends_on".into();
            db.save_knowledge_edge(edge.clone()).unwrap();
            assert!(db.save_knowledge_edge(edge.clone()).is_err());
            edge.expected_version = Some(2);
            edge.to_node_id = foreign;
            assert!(db.save_knowledge_edge(edge.clone()).is_err());
            edge.to_node_id = b.clone();
            db.connection().unwrap().execute_batch("CREATE TRIGGER fail_edge BEFORE INSERT ON knowledge_edge_versions BEGIN SELECT RAISE(ABORT,'test rollback'); END").unwrap();
            edge.active = false;
            assert!(db.save_knowledge_edge(edge.clone()).is_err());
            assert_eq!(
                db.knowledge_graph(&workspace).unwrap().edges[0]
                    .versions
                    .len(),
                2
            );
            db.connection()
                .unwrap()
                .execute_batch("DROP TRIGGER fail_edge")
                .unwrap();
            db.save_knowledge_edge(edge.clone()).unwrap();
            assert!(
                db.connection()
                    .unwrap()
                    .execute("UPDATE knowledge_edge_versions SET active=1", [])
                    .is_err()
            );
            assert!(
                db.connection()
                    .unwrap()
                    .execute("DELETE FROM knowledge_edge_versions", [])
                    .is_err()
            );
            edge.workspace_id = other.clone();
            edge.expected_version = Some(3);
            assert!(db.save_knowledge_edge(edge).is_err());
            assert!(db.knowledge_graph(&other).unwrap().edges.is_empty());
            let mut view = SaveGraphView {
                workspace_id: workspace.clone(),
                expected_revision: 0,
                camera: [3.0, 7.0, 20.0],
                target: [0.0, 0.0, 0.0],
                positions: vec![NodePosition {
                    node_id: a.clone(),
                    position: [2.0, 3.0, 4.0],
                }],
            };
            assert_eq!(db.save_graph_view(view.clone()).unwrap(), 1);
            assert!(db.save_graph_view(view.clone()).is_err());
            view.expected_revision = 1;
            view.positions[0].node_id = db.knowledge_graph(&other).unwrap().nodes[0].id.clone();
            assert!(db.save_graph_view(view.clone()).is_err());
            assert_eq!(db.knowledge_graph(&workspace).unwrap().view.revision, 1);
            view.positions[0].node_id = a.clone();
            view.positions[0].position[0] = f64::NAN;
            assert!(db.save_graph_view(view.clone()).is_err());
            view.positions[0].position[0] = 0.0;
            view.positions.push(view.positions[0].clone());
            assert!(db.save_graph_view(view).is_err());
            let knowledge = db.knowledge_detail(&workspace, &a).unwrap();
            assert_eq!(knowledge.node.latest_version, 1);
            assert_eq!(knowledge.node.revision, 1);
        }
        {
            let db = Database::open(&directory).unwrap();
            let graph = db.knowledge_graph(&workspace).unwrap();
            assert_eq!(graph.nodes.len(), 2);
            assert_eq!(graph.edges[0].id, edge_id);
            assert_eq!(graph.edges[0].versions.len(), 3);
            assert!(!graph.edges[0].versions[0].active);
            assert_eq!(graph.view.camera, [3.0, 7.0, 20.0]);
            assert_eq!(graph.view.positions[0].position, [2.0, 3.0, 4.0]);
            assert_eq!(graph.view.positions[0].node_id, a);
            assert!(graph.nodes.iter().any(|n| n.id == b));
            assert!(
                db.connection()
                    .unwrap()
                    .query_row("PRAGMA foreign_key_check", [], |_| Ok(()))
                    .optional()
                    .unwrap()
                    .is_none()
            );
        }
        for entry in std::fs::read_dir(&directory).unwrap() {
            std::fs::remove_file(entry.unwrap().path()).unwrap();
        }
        std::fs::remove_dir(directory).unwrap();
    }
}
#[cfg(test)]
mod migration_tests {
    use super::*;
    use rusqlite::Connection;
    use sha2::{Digest, Sha256};
    #[test]
    fn upgrades_v2_knowledge_without_changing_versions_or_approvals() {
        let directory = std::env::temp_dir().join(format!("cortexos-v2-graph-{}", new_id()));
        std::fs::create_dir(&directory).unwrap();
        {
            let mut connection = Connection::open(directory.join("cortexos.sqlite3")).unwrap();
            connection
                .pragma_update(None, "foreign_keys", "ON")
                .unwrap();
            connection.execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)").unwrap();
            let transaction = connection.transaction().unwrap();
            for (index, sql) in [
                include_str!("../migrations/0001_initial.sql"),
                include_str!("../migrations/0002_knowledge.sql"),
            ]
            .iter()
            .enumerate()
            {
                transaction.execute_batch(sql).unwrap();
                transaction
                    .execute(
                        "INSERT INTO schema_migrations VALUES(?1,?2,?3)",
                        params![
                            (index + 1) as i64,
                            format!("{:x}", Sha256::digest(sql.as_bytes())),
                            now()
                        ],
                    )
                    .unwrap();
            }
            transaction
                .execute(
                    "INSERT INTO workspaces VALUES('w','已有知识工作区',?1,?1)",
                    params![now()],
                )
                .unwrap();
            transaction.execute("INSERT INTO knowledge_nodes(id,workspace_id,latest_version,effective_version,revision,created_at,updated_at) VALUES('n','w',2,1,3,?1,?1)",params![now()]).unwrap();
            for version in 1..=2 {
                transaction.execute("INSERT INTO knowledge_versions VALUES('n',?1,'既有标题','knowledge',?2,'user','原有说明',?3)",params![version,format!("旧正文 {version}"),now()]).unwrap();
            }
            transaction
                .execute(
                    "INSERT INTO knowledge_approval_events VALUES('a','n',1,'user',?1)",
                    params![now()],
                )
                .unwrap();
            transaction.commit().unwrap();
        }
        {
            let db = Database::open(&directory).unwrap();
            let graph = db.knowledge_graph("w").unwrap();
            assert_eq!(graph.nodes.len(), 1);
            assert!(graph.edges.is_empty());
            let detail = db.knowledge_detail("w", "n").unwrap();
            assert_eq!(detail.node.latest_version, 2);
            assert_eq!(detail.node.effective_version, Some(1));
            assert_eq!(detail.node.revision, 3);
            assert_eq!(detail.versions[0].content, "旧正文 2");
            assert!(detail.versions[1].approved_at.is_some());
        }
        let backup = std::fs::read_dir(&directory)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("before-migration-3-")
            })
            .unwrap();
        {
            let connection = Connection::open(backup).unwrap();
            assert_eq!(
                connection
                    .query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r
                        .get::<_, i64>(0))
                    .unwrap(),
                2
            );
            assert_eq!(
                connection
                    .query_row("SELECT COUNT(*) FROM knowledge_versions", [], |r| r
                        .get::<_, i64>(0))
                    .unwrap(),
                2
            );
        }
        for entry in std::fs::read_dir(&directory).unwrap() {
            std::fs::remove_file(entry.unwrap().path()).unwrap();
        }
        std::fs::remove_dir(directory).unwrap();
    }
}
