use crate::{
    db::Database,
    models::{AppResult, new_id, now, validate_name},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeNode {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub kind: String,
    pub latest_version: i64,
    pub effective_version: Option<i64>,
    pub revision: i64,
    pub updated_at: String,
    pub source_message_id: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeVersion {
    pub version: i64,
    pub title: String,
    pub kind: String,
    pub content: String,
    pub change_reason: String,
    pub created_at: String,
    pub approved_at: Option<String>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeDetail {
    pub node: KnowledgeNode,
    pub versions: Vec<KnowledgeVersion>,
    pub source_conversation_id: Option<String>,
    pub source_excerpt: Option<String>,
    pub source_hash: Option<String>,
    pub source_evidence: Vec<serde_json::Value>,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveKnowledge {
    pub workspace_id: String,
    pub node_id: Option<String>,
    pub expected_revision: Option<i64>,
    pub title: String,
    pub kind: String,
    pub content: String,
    pub change_reason: String,
    pub source_message_id: Option<String>,
    pub source_excerpt: Option<String>,
}
fn error(_: rusqlite::Error) -> String {
    "知识读写失败，编辑内容已保留，请重试。".into()
}
fn missing() -> String {
    "知识不存在，或不属于当前工作区。".into()
}
pub(crate) const COLUMNS: &str = "n.id,n.workspace_id,v.title,v.kind,n.latest_version,n.effective_version,n.revision,n.updated_at,n.source_message_id";
pub(crate) fn node(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeNode> {
    Ok(KnowledgeNode {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        title: row.get(2)?,
        kind: row.get(3)?,
        latest_version: row.get(4)?,
        effective_version: row.get(5)?,
        revision: row.get(6)?,
        updated_at: row.get(7)?,
        source_message_id: row.get(8)?,
    })
}
fn read_node(connection: &Connection, workspace: &str, id: &str) -> AppResult<KnowledgeNode> {
    connection.query_row(&format!("SELECT {COLUMNS} FROM knowledge_nodes n JOIN knowledge_versions v ON v.node_id=n.id AND v.version=n.latest_version WHERE n.workspace_id=?1 AND n.id=?2"),params![workspace,id],node).optional().map_err(error)?.ok_or_else(missing)
}
fn revision(current: &KnowledgeNode, expected: Option<i64>) -> AppResult<()> {
    if expected != Some(current.revision) {
        return Err("知识已被另一处修改。你的编辑仍保留，请查看最新版本后重新比较。".into());
    }
    Ok(())
}
impl Database {
    pub fn knowledge_list(&self, workspace: &str) -> AppResult<Vec<KnowledgeNode>> {
        let connection = self.connection()?;
        let mut statement = connection.prepare(&format!("SELECT {COLUMNS} FROM knowledge_nodes n JOIN knowledge_versions v ON v.node_id=n.id AND v.version=n.latest_version WHERE n.workspace_id=?1 ORDER BY n.updated_at DESC,n.id")).map_err(error)?;
        statement
            .query_map(params![workspace], node)
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)
    }
    pub fn knowledge_detail(&self, workspace: &str, id: &str) -> AppResult<KnowledgeDetail> {
        let connection = self.connection()?;
        let node = read_node(&connection, workspace, id)?;
        let mut statement = connection.prepare("SELECT v.version,v.title,v.kind,v.content,v.change_reason,v.created_at,a.created_at FROM knowledge_versions v LEFT JOIN knowledge_approval_events a ON a.node_id=v.node_id AND a.version=v.version WHERE v.node_id=?1 ORDER BY v.version DESC").map_err(error)?;
        let versions = statement
            .query_map(params![id], |r| {
                Ok(KnowledgeVersion {
                    version: r.get(0)?,
                    title: r.get(1)?,
                    kind: r.get(2)?,
                    content: r.get(3)?,
                    change_reason: r.get(4)?,
                    created_at: r.get(5)?,
                    approved_at: r.get(6)?,
                })
            })
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)?;
        let (source_conversation_id,source_excerpt,source_hash) = connection.query_row("SELECT source_conversation_id,source_excerpt,source_hash FROM knowledge_nodes WHERE id=?1",params![id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(error)?;
        let source_evidence = versions
            .iter()
            .map(|v| {
                crate::sources::evidence(&connection, id, v.version).map(|items| {
                    items
                        .into_iter()
                        .map(|mut item| {
                            item["knowledgeVersion"] = serde_json::json!(v.version);
                            item
                        })
                        .collect::<Vec<_>>()
                })
            })
            .collect::<AppResult<Vec<_>>>()?
            .into_iter()
            .flatten()
            .collect();
        Ok(KnowledgeDetail {
            node,
            versions,
            source_conversation_id,
            source_excerpt,
            source_hash,
            source_evidence,
        })
    }
    pub fn save_knowledge(&self, input: SaveKnowledge) -> AppResult<String> {
        self.save_knowledge_with_evidence(input, None)
    }
    pub fn save_knowledge_with_evidence(
        &self,
        input: SaveKnowledge,
        source: Option<crate::sources::SourceRef>,
    ) -> AppResult<String> {
        let title = validate_name(&input.title)?;
        if ![
            "context",
            "knowledge",
            "hypothesis",
            "decision",
            "evidence",
            "conflict",
        ]
        .contains(&input.kind.as_str())
        {
            return Err("请选择有效的知识类型。".into());
        }
        let content = input.content.trim();
        let reason = input.change_reason.trim();
        if content.is_empty()
            || content.chars().count() > 20000
            || content.contains('\0')
            || reason.is_empty()
            || reason.chars().count() > 500
            || reason.contains('\0')
        {
            return Err("正文需为 1–20000 字，修改说明需为 1–500 字。".into());
        }
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(error)?;
        let source_excerpt = if let Some(reference) = source.as_ref() {
            if input.node_id.is_some()
                || input.source_message_id.is_some()
                || input.source_excerpt.is_some()
            {
                return Err(
                    "从文件选择的原文只能用于新建知识，不能替换已有知识的原始出处。".into(),
                );
            }
            Some(crate::sources::excerpt(
                &tx,
                &input.workspace_id,
                reference,
            )?)
        } else {
            None
        };
        let timestamp = now();
        let (id, version) = if let Some(id) = input.node_id.as_ref() {
            if input.source_message_id.is_some() || input.source_excerpt.is_some() {
                return Err("已保存知识的原始来源不能替换。".into());
            }
            let current = read_node(&tx, &input.workspace_id, id)?;
            revision(&current, input.expected_revision)?;
            let latest: (String,String,String) = tx.query_row("SELECT title,kind,content FROM knowledge_versions WHERE node_id=?1 AND version=?2",params![id,current.latest_version],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).map_err(error)?;
            if latest == (title.clone(), input.kind.clone(), content.to_string()) {
                return Err("内容没有变化，无需新增版本。".into());
            }
            tx.execute("UPDATE knowledge_nodes SET latest_version=latest_version+1,revision=revision+1,updated_at=?2 WHERE id=?1",params![id,timestamp]).map_err(error)?;
            (id.clone(), current.latest_version + 1)
        } else {
            if input.expected_revision.is_some() {
                return Err("新知识不应携带旧版本号。".into());
            }
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
            let (conversation, excerpt, hash) = match (
                &input.source_message_id,
                &input.source_excerpt,
            ) {
                (Some(message), Some(excerpt)) => {
                    let original: Option<(String,String)> = tx.query_row("SELECT conversation_id,content FROM messages WHERE workspace_id=?1 AND id=?2 AND role='assistant' AND status!='streaming'",params![input.workspace_id,message],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(error)?;
                    let (conversation, original) = original
                        .ok_or_else(|| "原回答不存在、尚未结束或不属于当前工作区。".to_string())?;
                    if excerpt.trim().is_empty()
                        || excerpt.chars().count() > 20000
                        || !original.contains(excerpt)
                    {
                        return Err("来源摘录必须是原回答中的连续文字，最多 20000 字。".into());
                    }
                    (
                        Some(conversation),
                        Some(excerpt.clone()),
                        Some(format!("{:x}", Sha256::digest(original.as_bytes()))),
                    )
                }
                (None, None) => (None, None, None),
                _ => return Err("请同时提供原回答和来源摘录。".into()),
            };
            let id = new_id();
            tx.execute("INSERT INTO knowledge_nodes(id,workspace_id,latest_version,effective_version,revision,created_at,updated_at,source_conversation_id,source_message_id,source_excerpt,source_hash) VALUES(?1,?2,1,NULL,1,?3,?3,?4,?5,?6,?7)",params![id,input.workspace_id,timestamp,conversation,input.source_message_id,excerpt,hash]).map_err(error)?;
            (id, 1)
        };
        tx.execute("INSERT INTO knowledge_versions(node_id,version,title,kind,content,author,change_reason,created_at) VALUES(?1,?2,?3,?4,?5,'user',?6,?7)",params![id,version,title,input.kind,content,reason,timestamp]).map_err(error)?;
        if let Some(reference) = source {
            tx.execute(
                "INSERT INTO knowledge_source_links VALUES(?1,?2,?3,?4,?5,?6,?7)",
                params![
                    id,
                    version,
                    reference.source_id,
                    reference.version,
                    reference.start_line as i64,
                    reference.end_line as i64,
                    source_excerpt
                ],
            )
            .map_err(error)?;
        } else if version > 1 {
            tx.execute("INSERT INTO knowledge_source_links SELECT node_id,?2,source_id,source_version,start_line,end_line,excerpt FROM knowledge_source_links WHERE node_id=?1 AND knowledge_version=?2-1",params![id,version]).map_err(error)?;
        }
        tx.commit().map_err(error)?;
        Ok(id)
    }
    pub fn approve_knowledge(&self, workspace: &str, id: &str, expected: i64) -> AppResult<()> {
        let mut connection = self.connection()?;
        let tx = connection.transaction().map_err(error)?;
        let current = read_node(&tx, workspace, id)?;
        revision(&current, Some(expected))?;
        if current.effective_version == Some(current.latest_version) {
            return Err("该版本已确认。".into());
        }
        if !crate::sources::available(&tx, id, current.latest_version)? {
            return Err(
                "这条知识使用的文件已停用，请重新添加文件以恢复使用，再检查并确认知识。".into(),
            );
        }
        let timestamp = now();
        tx.execute("INSERT INTO knowledge_approval_events(id,node_id,version,actor,created_at) VALUES(?1,?2,?3,'user',?4)",params![new_id(),id,current.latest_version,timestamp]).map_err(error)?;
        tx.execute("UPDATE knowledge_nodes SET effective_version=latest_version,revision=revision+1,updated_at=?2 WHERE id=?1",params![id,timestamp]).map_err(error)?;
        crate::retrieval::index_node(&tx, id)?;
        tx.commit().map_err(error)?;
        Ok(())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ModelSettings;
    fn draft(workspace: &str) -> SaveKnowledge {
        SaveKnowledge {
            workspace_id: workspace.into(),
            node_id: None,
            expected_revision: None,
            title: "测试知识".into(),
            kind: "knowledge".into(),
            content: "原始内容".into(),
            change_reason: "手动记录".into(),
            source_message_id: None,
            source_excerpt: None,
        }
    }
    #[test]
    fn revisions_approvals_scope_and_rollback() {
        let directory = std::env::temp_dir().join(format!("cortexos-knowledge-{}", new_id()));
        let id;
        let workspace;
        {
            let db = Database::open(&directory).unwrap();
            workspace = db.create_workspace("A").unwrap().id;
            let other = db.create_workspace("B").unwrap().id;
            id = db.save_knowledge(draft(&workspace)).unwrap();
            assert!(db.knowledge_detail(&other, &id).is_err());
            assert!(db.approve_knowledge(&other, &id, 1).is_err());
            assert!(db.knowledge_list(&other).unwrap().is_empty());
            db.approve_knowledge(&workspace, &id, 1).unwrap();
            let mut edit = draft(&workspace);
            edit.node_id = Some(id.clone());
            edit.expected_revision = Some(2);
            edit.content = "修订内容".into();
            db.save_knowledge(edit.clone()).unwrap();
            let detail = db.knowledge_detail(&workspace, &id).unwrap();
            assert_eq!(detail.node.effective_version, Some(1));
            assert_eq!(detail.node.latest_version, 2);
            assert_eq!(detail.versions[1].content, "原始内容");
            assert!(detail.versions[1].approved_at.is_some());
            assert!(db.save_knowledge(edit.clone()).is_err());
            assert!(db.approve_knowledge(&workspace, &id, 2).is_err());
            // Inject an insertion failure after pointer update: the complete transaction must roll back.
            db.connection().unwrap().execute_batch("CREATE TRIGGER fail_version BEFORE INSERT ON knowledge_versions BEGIN SELECT RAISE(ABORT,'test rollback'); END;").unwrap();
            edit.expected_revision = Some(3);
            edit.content = "失败内容".into();
            assert!(db.save_knowledge(edit).is_err());
            assert_eq!(
                db.knowledge_detail(&workspace, &id)
                    .unwrap()
                    .node
                    .latest_version,
                2
            );
            db.connection()
                .unwrap()
                .execute_batch("DROP TRIGGER fail_version")
                .unwrap();
            db.approve_knowledge(&workspace, &id, 3).unwrap();
            for sql in [
                "UPDATE knowledge_versions SET content='bad'",
                "DELETE FROM knowledge_versions",
                "DELETE FROM knowledge_approval_events",
                "UPDATE knowledge_approval_events SET actor='bad'",
                "UPDATE knowledge_nodes SET source_excerpt='bad'",
            ] {
                assert!(db.connection().unwrap().execute(sql, []).is_err());
            }
            let conversation = db.create_conversation(&workspace).unwrap();
            let prepared = db
                .prepare_run(
                    &new_id(),
                    &workspace,
                    &conversation.id,
                    "来源测试",
                    &ModelSettings::default(),
                )
                .unwrap();
            let mut source = draft(&workspace);
            source.source_message_id = Some(prepared.run.assistant_message_id.clone());
            source.source_excerpt = Some("原文片段".into());
            assert!(db.save_knowledge(source.clone()).is_err());
            db.finish(
                &prepared.run,
                "这是原文片段。",
                "completed",
                None,
                serde_json::json!({}),
            )
            .unwrap();
            let sourced = db.save_knowledge(source.clone()).unwrap();
            assert_eq!(
                db.knowledge_detail(&workspace, &sourced)
                    .unwrap()
                    .source_excerpt
                    .as_deref(),
                Some("原文片段")
            );
            source.workspace_id = other;
            assert!(db.save_knowledge(source.clone()).is_err());
            source.workspace_id = workspace.clone();
            source.source_excerpt = Some("编造的来源".into());
            assert!(db.save_knowledge(source).is_err());
        }
        {
            let db = Database::open(&directory).unwrap();
            let detail = db.knowledge_detail(&workspace, &id).unwrap();
            assert_eq!(detail.node.effective_version, Some(2));
            assert_eq!(detail.versions.len(), 2);
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
    #[test]
    fn upgrades_existing_database_with_consistent_backup_and_checks_all_migrations() {
        let directory = std::env::temp_dir().join(format!("cortexos-upgrade-{}", new_id()));
        std::fs::create_dir(&directory).unwrap();
        let path = directory.join("cortexos.sqlite3");
        {
            let connection = Connection::open(&path).unwrap();
            let sql = include_str!("../migrations/0001_initial.sql");
            connection.execute_batch(sql).unwrap();
            connection.execute_batch("CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)").unwrap();
            connection
                .execute(
                    "INSERT INTO schema_migrations VALUES(1,?1,?2)",
                    params![format!("{:x}", Sha256::digest(sql.as_bytes())), now()],
                )
                .unwrap();
            connection
                .execute(
                    "INSERT INTO workspaces VALUES('old','已有工作区',?1,?1)",
                    params![now()],
                )
                .unwrap();
        }
        {
            let db = Database::open(&directory).unwrap();
            assert_eq!(db.bootstrap().unwrap().workspaces[0].name, "已有工作区");
        }
        let backup = std::fs::read_dir(&directory)
            .unwrap()
            .map(|e| e.unwrap().path())
            .find(|p| {
                p.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("before-migration-")
            })
            .unwrap();
        {
            let connection = Connection::open(backup).unwrap();
            assert_eq!(
                connection
                    .query_row("SELECT COUNT(*) FROM schema_migrations", [], |r| r
                        .get::<_, i64>(0))
                    .unwrap(),
                1
            );
            assert_eq!(
                connection
                    .query_row("SELECT name FROM workspaces", [], |r| r.get::<_, String>(0))
                    .unwrap(),
                "已有工作区"
            );
        }
        {
            let connection = Connection::open(&path).unwrap();
            connection
                .execute(
                    "UPDATE schema_migrations SET checksum='bad' WHERE version=1",
                    [],
                )
                .unwrap();
        }
        assert!(Database::open(&directory).is_err());
        for entry in std::fs::read_dir(&directory).unwrap() {
            std::fs::remove_file(entry.unwrap().path()).unwrap();
        }
        std::fs::remove_dir(directory).unwrap();
    }
}
