use crate::{db::Database, models::*};
use rusqlite::{Connection, OptionalExtension, params};
use serde_json::{Value, json};
use std::collections::BTreeSet;

pub const ALGORITHM: &str = "fts5-cjk-bigram-latin-bm25-v1";
fn error(_: rusqlite::Error) -> String {
    "知识检索不可用，问题已保留。请重试；也可关闭本会话自动检索。".into()
}
fn cjk(c: char) -> bool {
    matches!(c as u32, 0x3400..=0x9fff | 0xf900..=0xfaff | 0x20000..=0x3134f | 0x3040..=0x30ff | 0xac00..=0xd7af)
}
// Lexical matching only: overlapping CJK pairs and lowercase alphanumeric words.
pub fn terms(text: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut previous = None;
    let mut latin = String::new();
    for c in text.chars().chain(std::iter::once(' ')) {
        if cjk(c) {
            if !latin.is_empty() {
                result.push(std::mem::take(&mut latin));
            }
            if let Some(p) = previous {
                result.push(format!("{p}{c}"));
            }
            previous = Some(c);
        } else {
            previous = None;
            if c.is_alphanumeric() {
                latin.extend(c.to_lowercase());
            } else if !latin.is_empty() {
                result.push(std::mem::take(&mut latin));
            }
        }
    }
    result
}
pub fn index_node(connection: &Connection, id: &str) -> AppResult<()> {
    connection
        .execute("DELETE FROM knowledge_fts WHERE node_id=?1", params![id])
        .map_err(error)?;
    let row: Option<(String,i64,String,String)>=connection.query_row("SELECT n.workspace_id,v.version,v.title,v.content FROM knowledge_nodes n JOIN knowledge_versions v ON v.node_id=n.id AND v.version=n.effective_version WHERE n.id=?1 AND v.kind IN ('knowledge','context','decision')",params![id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(error)?;
    if let Some((workspace, version, title, body)) = row {
        if !crate::sources::available(connection, id, version)? {
            return Ok(());
        }
        connection
            .execute(
                "INSERT INTO knowledge_fts VALUES(?1,?2,?3,?4,?5)",
                params![
                    id,
                    workspace,
                    version,
                    terms(&title).join(" "),
                    terms(&body).join(" ")
                ],
            )
            .map_err(error)?;
    }
    Ok(())
}
pub fn rebuild(connection: &Connection) -> AppResult<()> {
    connection
        .execute("DELETE FROM knowledge_fts", [])
        .map_err(error)?;
    let ids = connection
        .prepare("SELECT id FROM knowledge_nodes WHERE effective_version IS NOT NULL")
        .map_err(error)?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(error)?
        .collect::<rusqlite::Result<Vec<_>>>()
        .map_err(error)?;
    for id in ids {
        index_node(connection, &id)?;
    }
    Ok(())
}
pub fn enabled(connection: &Connection, workspace: &str, conversation: &str) -> AppResult<bool> {
    Ok(connection.query_row("SELECT enabled FROM conversation_retrieval_settings WHERE workspace_id=?1 AND conversation_id=?2",params![workspace,conversation],|r|r.get(0)).optional().map_err(error)?.unwrap_or(true))
}
impl Database {
    pub fn set_conversation_retrieval(
        &self,
        workspace: &str,
        conversation: &str,
        value: bool,
    ) -> AppResult<()> {
        let c = self.connection()?;
        let exists: bool = c
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=?1 AND id=?2)",
                params![workspace, conversation],
                |r| r.get(0),
            )
            .map_err(error)?;
        if !exists {
            return Err("会话不属于当前工作区。".into());
        }
        c.execute("INSERT INTO conversation_retrieval_settings VALUES(?1,?2,?3) ON CONFLICT(conversation_id) DO UPDATE SET enabled=excluded.enabled",params![conversation,workspace,value]).map_err(error)?;
        Ok(())
    }
}
pub fn search(connection: &Connection, workspace: &str, query: &str) -> AppResult<Value> {
    let started = now();
    let clock = std::time::Instant::now();
    let mut seen = BTreeSet::new();
    let tokens: Vec<_> = terms(query)
        .into_iter()
        .filter(|x| {
            ![
                "什么", "如何", "我们", "你们", "请问", "一下", "怎么", "哪些", "the", "is", "a",
                "an", "of", "to", "and",
            ]
            .contains(&x.as_str())
        })
        .filter(|x| seen.insert(x.clone()))
        .collect();
    let truncated = tokens.len() > 64;
    let tokens: Vec<_> = tokens.into_iter().take(64).collect();
    let expression = tokens
        .iter()
        .map(|t| format!("\"{t}\""))
        .collect::<Vec<_>>()
        .join(" OR ");
    let mut candidates = Vec::new();
    if !expression.is_empty() {
        let mut statement=connection.prepare("SELECT n.id,v.version,v.title,v.kind,v.content,bm25(knowledge_fts,0,0,0,5,1) FROM knowledge_fts JOIN knowledge_nodes n ON n.id=knowledge_fts.node_id AND n.workspace_id=knowledge_fts.workspace_id JOIN knowledge_versions v ON v.node_id=n.id AND v.version=n.effective_version AND v.version=knowledge_fts.version WHERE knowledge_fts MATCH ?1 AND n.workspace_id=?2 AND v.kind IN ('knowledge','context','decision') AND NOT EXISTS(SELECT 1 FROM knowledge_source_links l JOIN source_documents s ON s.id=l.source_id WHERE l.node_id=n.id AND l.knowledge_version=v.version AND s.enabled=0) ORDER BY bm25(knowledge_fts,0,0,0,5,1),n.id LIMIT 21").map_err(error)?;
        candidates=statement.query_map(params![expression,workspace],|r|Ok(json!({"nodeId":r.get::<_,String>(0)?,"version":r.get::<_,i64>(1)?,"title":r.get::<_,String>(2)?,"kind":r.get::<_,String>(3)?,"content":r.get::<_,String>(4)?,"score":r.get::<_,f64>(5)?,"included":false,"reason":"pending_budget","costUnits":0}))).map_err(error)?.collect::<rusqlite::Result<Vec<_>>>().map_err(error)?;
    }
    let capped = candidates.len() > 20;
    candidates.truncate(20);
    Ok(
        json!({"enabled":true,"algorithm":ALGORITHM,"terms":tokens,"queryTruncated":truncated,"candidateLimit":20,"candidatesTruncated":capped,"autoLimit":5,"startedAt":started,"finishedAt":now(),"elapsedMicros":clock.elapsed().as_micros() as u64,"status":if expression.is_empty(){"no_search_terms"}else if candidates.is_empty(){"no_match"}else{"matched"},"candidates":candidates}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::knowledge::SaveKnowledge;
    fn draft(w: &str, title: &str, content: &str) -> SaveKnowledge {
        SaveKnowledge {
            workspace_id: w.into(),
            node_id: None,
            expected_revision: None,
            title: title.into(),
            kind: "knowledge".into(),
            content: content.into(),
            change_reason: "检索测试".into(),
            source_message_id: None,
            source_excerpt: None,
        }
    }
    fn approved(db: &Database, w: &str, title: &str, content: &str) -> String {
        let id = db.save_knowledge(draft(w, title, content)).unwrap();
        db.approve_knowledge(w, &id, 1).unwrap();
        id
    }
    fn setup() -> (std::path::PathBuf, Database, String, String) {
        let path = std::env::temp_dir().join(format!("cortex-retrieval-{}", new_id()));
        let db = Database::open(&path).unwrap();
        let w = db.create_workspace("检索验收").unwrap().id;
        let c = db.create_conversation(&w).unwrap().id;
        (path, db, w, c)
    }
    #[test]
    fn tokenizer_comparison_and_fixed_mixed_language_queries() {
        let (path, db, w, _) = setup();
        {
            let conn = db.connection().unwrap();
            conn.execute_batch("CREATE VIRTUAL TABLE default_words USING fts5(body); CREATE VIRTUAL TABLE trigrams USING fts5(body,tokenize='trigram'); INSERT INTO default_words VALUES('项目发布计划'); INSERT INTO trigrams VALUES('项目发布计划');").unwrap();
            for table in ["default_words", "trigrams"] {
                let count: i64 = conn
                    .query_row(
                        &format!("SELECT count(*) FROM {table} WHERE {table} MATCH '发布'"),
                        [],
                        |r| r.get(0),
                    )
                    .unwrap();
                assert_eq!(count, 0);
            }
        }
        let release = approved(&db, &w, "发布计划", "项目发布定于周四。");
        let backup = approved(&db, &w, "数据库备份", "SQLite 数据库备份采用一致性快照。");
        let cancel = approved(&db, &w, "取消生成", "取消生成后保留部分回答。");
        let gpu = approved(&db, &w, "显存预算", "GPU 显存不足时减小上下文。");
        let code = approved(&db, &w, "HTTP超时", "reqwest timeout 参数控制请求超时。");
        let auth = approved(&db, &w, "API鉴权", "API_AUTH_TOKEN 只在本地配置。");
        let queries = [
            ("发布", &release),
            ("项目什么时候发布", &release),
            ("SQLite如何备份", &backup),
            ("备份", &backup),
            ("怎么取消生成", &cancel),
            ("GPU显存不足", &gpu),
            ("reqwest timeout", &code),
            ("API_AUTH_TOKEN", &auth),
        ];
        for (q, id) in queries {
            let report = search(&db.connection().unwrap(), &w, q).unwrap();
            assert_eq!(report["candidates"][0]["nodeId"], *id, "query: {q}");
        }
        let no = search(&db.connection().unwrap(), &w, "火星香蕉").unwrap();
        assert_eq!(no["status"], "no_match");
        let empty = search(&db.connection().unwrap(), &w, "? OR \" ***").unwrap();
        assert!(empty["candidates"].as_array().unwrap().is_empty());
        let single = search(&db.connection().unwrap(), &w, "发").unwrap();
        assert_eq!(single["status"], "no_search_terms");
        drop(db);
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn retrieval_snapshot_approval_budget_preferences_and_rollback() {
        let (path, db, w, c) = setup();
        let other = db.create_workspace("隔离").unwrap().id;
        let id = approved(&db, &w, "发布计划", "周一发布。");
        approved(&db, &other, "发布计划", "跨工作区内容。");
        db.save_knowledge(draft(&w, "发布草案", "未确认发布内容。"))
            .unwrap();
        let mut edit = draft(&w, "发布计划", "周二发布。");
        edit.node_id = Some(id.clone());
        edit.expected_revision = Some(2);
        db.save_knowledge(edit).unwrap();
        let settings = ModelSettings::default();
        let old = db
            .prepare_context_run(&new_id(), &w, &c, "发布", &settings, &[], false)
            .unwrap();
        assert_eq!(
            old.manifest["retrieval"]["candidates"]
                .as_array()
                .unwrap()
                .len(),
            1
        );
        assert_eq!(old.manifest["knowledgeRefs"][0]["version"], 1);
        assert!(old.request.to_string().contains("周一"));
        assert!(!old.request.to_string().contains("周二"));
        let first = db.run_detail(&w, &old.run.id).unwrap();
        assert_eq!(
            first
                .events
                .iter()
                .map(|e| e.kind.as_str())
                .collect::<Vec<_>>(),
            [
                "request_received",
                "retrieval_started",
                "retrieval_completed",
                "context_prepared"
            ]
        );
        assert!(
            first
                .events
                .windows(2)
                .all(|p| p[0].occurred_at <= p[1].occurred_at)
        );
        db.finish(&old.run, "周一", "completed", None, json!({}))
            .unwrap();
        db.approve_knowledge(&w, &id, 3).unwrap();
        let next = db
            .prepare_context_run(&new_id(), &w, &c, "发布", &settings, &[], true)
            .unwrap();
        assert_eq!(next.manifest["knowledgeRefs"][0]["version"], 2);
        let manual = db
            .prepare_context_run(
                &new_id(),
                &w,
                &c,
                "发布",
                &settings,
                &[ContextSelection {
                    node_id: id.clone(),
                    version: 2,
                }],
                true,
            )
            .unwrap();
        assert_eq!(
            manual.manifest["knowledgeRefs"].as_array().unwrap().len(),
            1
        );
        assert_eq!(
            manual.manifest["retrieval"]["candidates"][0]["reason"],
            "manual_selected"
        );
        let big = approved(&db, &w, "长文档", &"长文档资料".repeat(1000));
        let budget = db
            .prepare_context_run(&new_id(), &w, &c, "长文档", &settings, &[], true)
            .unwrap();
        assert_eq!(
            budget.manifest["retrieval"]["candidates"][0]["reason"],
            "auto_budget"
        );
        assert!(
            budget.manifest["knowledgeRefs"]
                .as_array()
                .unwrap()
                .is_empty()
        );
        assert!(
            db.prepare_context_run(
                &new_id(),
                &w,
                &c,
                "长文档",
                &settings,
                &[ContextSelection {
                    node_id: big,
                    version: 1
                }],
                false
            )
            .is_err()
        );
        assert!(db.set_conversation_retrieval(&other, &c, false).is_err());
        db.set_conversation_retrieval(&w, &c, false).unwrap();
        let disabled = db
            .prepare_context_run(&new_id(), &w, &c, "发布", &settings, &[], false)
            .unwrap();
        assert_eq!(disabled.manifest["retrievalUsed"], false);
        assert_eq!(db.run_detail(&w, &disabled.run.id).unwrap().events.len(), 2);
        db.finish(&disabled.run, "", "cancelled", None, json!({}))
            .unwrap();
        db.set_conversation_retrieval(&w, &c, true).unwrap();
        let count: i64 = db
            .connection()
            .unwrap()
            .query_row("SELECT count(*) FROM execution_runs", [], |r| r.get(0))
            .unwrap();
        db.connection().unwrap().execute_batch("CREATE TRIGGER fail_retrieval BEFORE INSERT ON retrieval_results BEGIN SELECT RAISE(ABORT,'fixture'); END;").unwrap();
        assert!(
            db.prepare_context_run(&new_id(), &w, &c, "发布", &settings, &[], false)
                .is_err()
        );
        assert_eq!(
            db.connection()
                .unwrap()
                .query_row("SELECT count(*) FROM execution_runs", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            count
        );
        db.connection()
            .unwrap()
            .execute_batch("DROP TRIGGER fail_retrieval;")
            .unwrap();
        assert!(
            db.connection()
                .unwrap()
                .execute("UPDATE retrieval_results SET reason='fake'", [])
                .is_err()
        );
        assert!(
            db.connection()
                .unwrap()
                .execute("DELETE FROM retrieval_results", [])
                .is_err()
        );
        // Approval and FTS update are one transaction.
        let mut edit = draft(&w, "发布计划", "周三发布。");
        edit.node_id = Some(id.clone());
        edit.expected_revision = Some(4);
        db.save_knowledge(edit).unwrap();
        db.connection()
            .unwrap()
            .execute_batch("DROP TABLE knowledge_fts;")
            .unwrap();
        assert!(db.approve_knowledge(&w, &id, 5).is_err());
        assert_eq!(
            db.knowledge_detail(&w, &id).unwrap().node.effective_version,
            Some(2)
        );
        db.connection().unwrap().execute_batch("CREATE VIRTUAL TABLE knowledge_fts USING fts5(node_id UNINDEXED,workspace_id UNINDEXED,version UNINDEXED,title_terms,body_terms,tokenize='unicode61');").unwrap();
        rebuild(&db.connection().unwrap()).unwrap();
        db.set_conversation_retrieval(&w, &c, false).unwrap();
        drop(db);
        let reopened = Database::open(&path).unwrap();
        assert!(!reopened.conversations(&w).unwrap()[0].auto_retrieval);
        assert_eq!(
            reopened
                .run_detail(&w, &old.run.id)
                .unwrap()
                .snapshot
                .unwrap()
                .request,
            old.request
        );
        assert!(
            reopened
                .connection()
                .unwrap()
                .prepare("PRAGMA foreign_key_check")
                .unwrap()
                .query([])
                .unwrap()
                .next()
                .unwrap()
                .is_none()
        );
        drop(reopened);
        std::fs::remove_dir_all(path).unwrap();
    }
    #[test]
    fn v5_upgrade_backfills_effective_versions_and_limits_candidates() {
        let (path, db, w, c) = setup();
        for i in 0..26 {
            approved(&db, &w, &format!("发布资料{i}"), "发布。");
        }
        let settings = ModelSettings {
            num_ctx: 16384,
            ..Default::default()
        };
        let preview = db
            .prepare_context_run(&new_id(), &w, &c, "发布", &settings, &[], true)
            .unwrap();
        assert_eq!(
            preview.manifest["retrieval"]["candidates"]
                .as_array()
                .unwrap()
                .len(),
            20
        );
        assert_eq!(preview.manifest["retrieval"]["candidatesTruncated"], true);
        assert_eq!(preview.manifest["retrieval"]["includedCount"], 5);
        assert_eq!(
            preview.manifest["retrieval"]["candidates"][5]["reason"],
            "auto_limit"
        );
        assert_eq!(
            db.connection()
                .unwrap()
                .query_row("SELECT count(*) FROM retrieval_results", [], |r| r
                    .get::<_, i64>(0))
                .unwrap(),
            0
        );
        // Restore the exact pre-v6 table set while retaining approved knowledge fixtures.
        db.connection().unwrap().execute_batch("DROP TABLE knowledge_fts; DROP TABLE retrieval_results; DROP TABLE conversation_retrieval_settings; DELETE FROM schema_migrations WHERE version=6;").unwrap();
        drop(db);
        let migrated = Database::open(&path).unwrap();
        assert!(migrated.conversations(&w).unwrap()[0].auto_retrieval);
        assert_eq!(
            search(&migrated.connection().unwrap(), &w, "发布").unwrap()["candidates"]
                .as_array()
                .unwrap()
                .len(),
            20
        );
        assert!(std::fs::read_dir(&path).unwrap().any(|f| {
            f.unwrap()
                .file_name()
                .to_string_lossy()
                .starts_with("before-migration-6-")
        }));
        assert_eq!(
            migrated
                .connection()
                .unwrap()
                .query_row("PRAGMA integrity_check", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
        drop(migrated);
        std::fs::remove_dir_all(path).unwrap();
    }
}
