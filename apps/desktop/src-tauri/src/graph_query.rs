use crate::{
    db::Database,
    graph::{EdgeVersion, GraphEdge, GraphView},
    knowledge::{COLUMNS, KnowledgeNode, node},
    models::AppResult,
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

fn error(_: rusqlite::Error) -> String {
    "图谱读取失败，请保留修改后重试。".into()
}
fn missing() -> String {
    "对象不存在，或不属于当前工作区。".into()
}
fn snapshot(c: &Connection, workspace: &str, expected: Option<&str>) -> AppResult<(String, i64)> {
    if !c
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=?1)",
            [workspace],
            |r| r.get::<_, bool>(0),
        )
        .map_err(error)?
    {
        return Err(missing());
    }
    let (count, revisions): (i64, i64) = c
        .query_row(
            "SELECT count(*),coalesce(sum(revision),0) FROM knowledge_nodes WHERE workspace_id=?1",
            [workspace],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(error)?;
    let (edges, versions): (i64,i64) = c.query_row("SELECT count(*),coalesce(sum(latest_version),0) FROM knowledge_edges WHERE workspace_id=?1", [workspace], |r| Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
    let layout: i64 = c
        .query_row(
            "SELECT revision FROM graph_layouts WHERE workspace_id=?1",
            [workspace],
            |r| r.get(0),
        )
        .optional()
        .map_err(error)?
        .unwrap_or(0);
    let value = format!("{count}:{revisions}:{edges}:{versions}:{layout}");
    if expected.is_some_and(|s| s != value) {
        return Err("图谱已更新，请重新读取当前范围；尚未保存的位置仍保留。".into());
    }
    Ok((value, count))
}
fn own_node(c: &Connection, workspace: &str, id: &str) -> AppResult<()> {
    if c.query_row(
        "SELECT EXISTS(SELECT 1 FROM knowledge_nodes WHERE workspace_id=?1 AND id=?2)",
        params![workspace, id],
        |r| r.get::<_, bool>(0),
    )
    .map_err(error)?
    {
        Ok(())
    } else {
        Err(missing())
    }
}
const ORDERED: &str = "WITH ordered AS (SELECT *,row_number() OVER (ORDER BY created_at,id)-1 AS layout_index FROM knowledge_nodes WHERE workspace_id=?1) ";
const NODE_FROM: &str = " FROM ordered n JOIN knowledge_versions v ON v.node_id=n.id AND v.version=n.latest_version LEFT JOIN knowledge_positions p ON p.workspace_id=n.workspace_id AND p.node_id=n.id ";
const RANGE: &str = " (?6 IS NULL OR n.id=?6 OR n.id IN (SELECT CASE WHEN ev.from_node_id=?6 THEN ev.to_node_id ELSE ev.from_node_id END FROM knowledge_edges e JOIN knowledge_edge_versions ev ON ev.edge_id=e.id AND ev.version=e.latest_version AND ev.workspace_id=e.workspace_id WHERE e.workspace_id=?1 AND ev.active=1 AND (ev.from_node_id=?6 OR ev.to_node_id=?6))) ";
const FILTER: &str = " AND cortex_contains(v.title,?2) AND (?3='all' OR v.kind=?3) AND (?4='all' OR (?4='confirmed' AND n.latest_version=n.effective_version) OR (?4='draft' AND (n.effective_version IS NULL OR n.latest_version<>n.effective_version))) AND (?5 IS NULL OR n.updated_at>=?5) ";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    #[serde(flatten)]
    pub node: KnowledgeNode,
    pub layout_index: i64,
    pub saved_position: Option<[f64; 3]>,
}
fn graph_node(r: &rusqlite::Row<'_>) -> rusqlite::Result<GraphNode> {
    Ok(GraphNode {
        node: node(r)?,
        layout_index: r.get(9)?,
        saved_position: r
            .get::<_, Option<f64>>(10)?
            .map(|x| -> rusqlite::Result<_> { Ok([x, r.get(11)?, r.get(12)?]) })
            .transpose()?,
    })
}
fn nodes_for(c: &Connection, workspace: &str, ids: &[String]) -> AppResult<Vec<GraphNode>> {
    let encoded = serde_json::to_string(ids).map_err(|_| missing())?;
    let mut stmt=c.prepare(&format!("{ORDERED} SELECT {COLUMNS},n.layout_index,p.x,p.y,p.z {NODE_FROM} WHERE n.id IN (SELECT value FROM json_each(?2)) ORDER BY n.layout_index")).map_err(error)?;
    let nodes = stmt
        .query_map(params![workspace, encoded], graph_node)
        .map_err(error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error)?;
    if nodes.len() != ids.len() {
        return Err(missing());
    }
    Ok(nodes)
}
fn view(c: &Connection, workspace: &str) -> AppResult<GraphView> {
    let stored: Option<(i64, String, String)> = c
        .query_row(
            "SELECT revision,camera_json,target_json FROM graph_layouts WHERE workspace_id=?1",
            [workspace],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(error)?;
    let (revision, camera, target) = match stored {
        Some((r, c, t)) => (
            r,
            serde_json::from_str(&c).map_err(|_| "视角格式异常。")?,
            serde_json::from_str(&t).map_err(|_| "视角格式异常。")?,
        ),
        None => (0, [0., 8., 20.], [0., 0., 0.]),
    };
    Ok(GraphView {
        revision,
        camera,
        target,
        positions: vec![],
    })
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NodeQuery {
    pub workspace_id: String,
    pub query: String,
    pub kind: String,
    pub status: String,
    pub since_utc: Option<String>,
    pub root_node_id: Option<String>,
    pub offset: i64,
    pub limit: i64,
    pub expected_snapshot: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodePage {
    pub nodes: Vec<GraphNode>,
    pub total_nodes: i64,
    pub matching_nodes: i64,
    pub range_nodes: i64,
    pub snapshot: String,
    pub view: GraphView,
}
fn edge_version(r: &rusqlite::Row<'_>) -> rusqlite::Result<EdgeVersion> {
    Ok(EdgeVersion {
        version: r.get(0)?,
        from_node_id: r.get(1)?,
        to_node_id: r.get(2)?,
        relation: r.get(3)?,
        active: r.get(4)?,
        change_reason: r.get(5)?,
        created_at: r.get(6)?,
    })
}
const EDGE_FIELDS: &str =
    "v.version,v.from_node_id,v.to_node_id,v.relation,v.active,v.change_reason,v.created_at";
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationPage {
    pub edges: Vec<GraphEdge>,
    pub nodes: Vec<GraphNode>,
    pub total: i64,
    pub snapshot: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    pub versions: Vec<EdgeVersion>,
    pub nodes: Vec<GraphNode>,
    pub total: i64,
    pub latest_version: i64,
    pub next_before: Option<i64>,
}
fn endpoints(versions: impl Iterator<Item = EdgeVersion>) -> Vec<String> {
    let mut ids = std::collections::BTreeSet::new();
    for v in versions {
        ids.insert(v.from_node_id);
        ids.insert(v.to_node_id);
    }
    ids.into_iter().collect()
}
impl Database {
    pub fn graph_node_page(&self, q: NodeQuery) -> AppResult<NodePage> {
        if !(1..=200).contains(&q.limit)
            || q.offset < 0
            || q.query.chars().count() > 200
            || ![
                "all",
                "knowledge",
                "context",
                "hypothesis",
                "decision",
                "evidence",
                "conflict",
            ]
            .contains(&q.kind.as_str())
            || !["all", "confirmed", "draft"].contains(&q.status.as_str())
        {
            return Err("图谱筛选或分页参数无效。".into());
        }
        let since = q
            .since_utc
            .as_deref()
            .map(|s| {
                chrono::DateTime::parse_from_rfc3339(s).map(|d| {
                    d.with_timezone(&chrono::Utc)
                        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
                })
            })
            .transpose()
            .map_err(|_| "更新日期无效。")?;
        let c = self.connection()?;
        c.create_scalar_function(
            "cortex_contains",
            2,
            rusqlite::functions::FunctionFlags::SQLITE_UTF8
                | rusqlite::functions::FunctionFlags::SQLITE_DETERMINISTIC,
            |ctx| {
                Ok(ctx
                    .get::<String>(0)?
                    .to_lowercase()
                    .contains(&ctx.get::<String>(1)?.to_lowercase()))
            },
        )
        .map_err(error)?;
        let (snapshot, total_nodes) =
            snapshot(&c, &q.workspace_id, q.expected_snapshot.as_deref())?;
        if let Some(root) = q.root_node_id.as_deref() {
            own_node(&c, &q.workspace_id, root)?;
        }
        let args = params![
            q.workspace_id,
            q.query,
            q.kind,
            q.status,
            since,
            q.root_node_id
        ];
        let matching_nodes = c
            .query_row(
                &format!("{ORDERED} SELECT count(*) {NODE_FROM} WHERE {RANGE} {FILTER}"),
                args,
                |r| r.get(0),
            )
            .map_err(error)?;
        let range_nodes = c
            .query_row(
                &format!("{ORDERED} SELECT count(*) {NODE_FROM} WHERE {RANGE}"),
                args,
                |r| r.get(0),
            )
            .map_err(error)?;
        let mut statement=c.prepare(&format!("{ORDERED} SELECT {COLUMNS},n.layout_index,p.x,p.y,p.z {NODE_FROM} WHERE {RANGE} {FILTER} ORDER BY CASE WHEN n.id=?6 THEN 0 ELSE 1 END,n.layout_index LIMIT ?7 OFFSET ?8")).map_err(error)?;
        let nodes = statement
            .query_map(
                params![
                    q.workspace_id,
                    q.query,
                    q.kind,
                    q.status,
                    since,
                    q.root_node_id,
                    q.limit,
                    q.offset
                ],
                graph_node,
            )
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        Ok(NodePage {
            nodes,
            total_nodes,
            matching_nodes,
            range_nodes,
            snapshot,
            view: view(&c, &q.workspace_id)?,
        })
    }
    pub fn graph_node(&self, workspace: &str, id: &str) -> AppResult<GraphNode> {
        let c = self.connection()?;
        nodes_for(&c, workspace, &[id.into()])?
            .pop()
            .ok_or_else(missing)
    }
    pub fn graph_links(
        &self,
        workspace: &str,
        ids: Vec<String>,
        expected: &str,
    ) -> AppResult<Vec<GraphEdge>> {
        if ids.len() > 10000
            || ids.iter().collect::<std::collections::HashSet<_>>().len() != ids.len()
        {
            return Err("节点范围过大或包含重复项，请缩小显示范围。".into());
        }
        let c = self.connection()?;
        snapshot(&c, workspace, Some(expected))?;
        nodes_for(&c, workspace, &ids)?;
        let encoded = serde_json::to_string(&ids).map_err(|_| missing())?;
        let mut stmt=c.prepare(&format!("SELECT e.id,{EDGE_FIELDS} FROM knowledge_edges e JOIN knowledge_edge_versions v ON v.edge_id=e.id AND v.workspace_id=e.workspace_id AND v.version=e.latest_version WHERE e.workspace_id=?1 AND v.active=1 AND v.from_node_id IN (SELECT value FROM json_each(?2)) AND v.to_node_id IN (SELECT value FROM json_each(?2)) ORDER BY e.id")).map_err(error)?;
        stmt.query_map(params![workspace, encoded], |r| {
            Ok(GraphEdge {
                id: r.get(0)?,
                versions: vec![EdgeVersion {
                    version: r.get(1)?,
                    from_node_id: r.get(2)?,
                    to_node_id: r.get(3)?,
                    relation: r.get(4)?,
                    active: r.get(5)?,
                    change_reason: r.get(6)?,
                    created_at: r.get(7)?,
                }],
            })
        })
        .map_err(error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error)
    }
    pub fn graph_relations(
        &self,
        workspace: &str,
        id: &str,
        offset: i64,
        limit: i64,
        expected: Option<&str>,
    ) -> AppResult<RelationPage> {
        if offset < 0 || !(1..=50).contains(&limit) {
            return Err("关系分页参数无效。".into());
        }
        let c = self.connection()?;
        let (snapshot, _) = snapshot(&c, workspace, expected)?;
        own_node(&c, workspace, id)?;
        let from = " FROM knowledge_edges e JOIN knowledge_edge_versions v ON v.edge_id=e.id AND v.workspace_id=e.workspace_id AND v.version=e.latest_version WHERE e.workspace_id=?1 AND (v.from_node_id=?2 OR v.to_node_id=?2)";
        let total = c
            .query_row(
                &format!("SELECT count(*) {from}"),
                params![workspace, id],
                |r| r.get(0),
            )
            .map_err(error)?;
        let mut stmt = c
            .prepare(&format!(
                "SELECT e.id,{EDGE_FIELDS} {from} ORDER BY e.id LIMIT ?3 OFFSET ?4"
            ))
            .map_err(error)?;
        let edges = stmt
            .query_map(params![workspace, id, limit, offset], |r| {
                Ok(GraphEdge {
                    id: r.get(0)?,
                    versions: vec![EdgeVersion {
                        version: r.get(1)?,
                        from_node_id: r.get(2)?,
                        to_node_id: r.get(3)?,
                        relation: r.get(4)?,
                        active: r.get(5)?,
                        change_reason: r.get(6)?,
                        created_at: r.get(7)?,
                    }],
                })
            })
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        let nodes = nodes_for(
            &c,
            workspace,
            &endpoints(edges.iter().flat_map(|e| e.versions.clone())),
        )?;
        Ok(RelationPage {
            edges,
            nodes,
            total,
            snapshot,
        })
    }
    pub fn graph_history(
        &self,
        workspace: &str,
        id: &str,
        before: Option<i64>,
        limit: i64,
    ) -> AppResult<HistoryPage> {
        if !(1..=50).contains(&limit) || before.is_some_and(|v| v < 1) {
            return Err("历史分页参数无效。".into());
        }
        let c = self.connection()?;
        let latest_version: i64 = c
            .query_row(
                "SELECT latest_version FROM knowledge_edges WHERE workspace_id=?1 AND id=?2",
                params![workspace, id],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?
            .ok_or_else(missing)?;
        let total = c
            .query_row(
                "SELECT count(*) FROM knowledge_edge_versions WHERE workspace_id=?1 AND edge_id=?2",
                params![workspace, id],
                |r| r.get(0),
            )
            .map_err(error)?;
        let mut stmt=c.prepare(&format!("SELECT {EDGE_FIELDS} FROM knowledge_edge_versions v WHERE v.workspace_id=?1 AND v.edge_id=?2 AND (?3 IS NULL OR v.version<?3) ORDER BY v.version DESC LIMIT ?4")).map_err(error)?;
        let versions = stmt
            .query_map(params![workspace, id, before, limit], edge_version)
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        let next_before = versions.last().filter(|v| v.version > 1).map(|v| v.version);
        let nodes = nodes_for(&c, workspace, &endpoints(versions.iter().cloned()))?;
        Ok(HistoryPage {
            versions,
            nodes,
            total,
            latest_version,
            next_before,
        })
    }
}
