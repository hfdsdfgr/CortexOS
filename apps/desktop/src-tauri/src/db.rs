use crate::models::*;
use rusqlite::{Connection, OptionalExtension, Row, params};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

const MIGRATIONS: &[&str] = &[MIGRATION, include_str!("../migrations/0002_knowledge.sql")];
const MIGRATION: &str = include_str!("../migrations/0001_initial.sql");
const RUN_COLUMNS: &str = "id,workspace_id,conversation_id,assistant_message_id,model_id,status,started_at,finished_at,error_message";
const SYSTEM_PROMPT: &str = "你是 CortexOS 本地项目助手。使用中文清晰回答。区分事实、假设与建议；没有来源时不要编造引用，不要声称内容已经验证。当前没有文件检索或工具权限。直接给出可用的回答，无需输出内部思考过程。";

fn error(_: rusqlite::Error) -> String {
    "本地数据读写失败，请保留草稿并重试。".into()
}
fn json_error(_: serde_json::Error) -> String {
    "本地数据格式异常，请保留数据并检查应用版本。".into()
}
fn hash(text: &str) -> String {
    format!("{:x}", Sha256::digest(text.as_bytes()))
}
fn missing() -> String {
    "所选内容不存在，或不属于当前工作区。".into()
}

fn read_run(row: &Row<'_>) -> rusqlite::Result<RunSummary> {
    Ok(RunSummary {
        id: row.get(0)?,
        workspace_id: row.get(1)?,
        conversation_id: row.get(2)?,
        assistant_message_id: row.get(3)?,
        model_id: row.get(4)?,
        status: row.get(5)?,
        started_at: row.get(6)?,
        finished_at: row.get(7)?,
        error_message: row.get(8)?,
    })
}

fn event(connection: &Connection, run_id: &str, kind: &str, payload: Value) -> AppResult<()> {
    connection
        .execute(
            "INSERT INTO execution_events(id,run_id,seq,kind,occurred_at,payload_json)
      VALUES(?1,?2,(SELECT COALESCE(MAX(seq),0)+1 FROM execution_events WHERE run_id=?2),?3,?4,?5)",
            params![new_id(), run_id, kind, now(), payload.to_string()],
        )
        .map_err(error)?;
    Ok(())
}

pub struct Database {
    connection: Mutex<Connection>,
    pub path: PathBuf,
    _lock: File,
}

impl Database {
    pub fn open(directory: &Path) -> AppResult<Self> {
        std::fs::create_dir_all(directory)
            .map_err(|_| "无法创建本地数据目录，请检查磁盘空间和权限。".to_string())?;
        let path = directory.join("cortexos.sqlite3");
        let mut options = OpenOptions::new();
        options.read(true).write(true).create(true).truncate(false);
        #[cfg(windows)]
        {
            use std::os::windows::fs::OpenOptionsExt;
            options.share_mode(0);
        }
        let lock = options.open(directory.join("cortexos.lock")).map_err(|_| {
            "数据目录正在被另一个 CortexOS 窗口使用，或没有访问权限。请先关闭另一窗口。".to_string()
        })?;
        let mut connection = Connection::open(&path).map_err(error)?;
        connection
            .busy_timeout(std::time::Duration::from_secs(3))
            .map_err(error)?;
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .map_err(error)?;
        connection
            .pragma_update(None, "journal_mode", "WAL")
            .map_err(error)?;
        connection
            .pragma_update(None, "synchronous", "FULL")
            .map_err(error)?;
        let fts5: bool = connection
            .query_row("SELECT sqlite_compileoption_used('ENABLE_FTS5')", [], |r| {
                r.get(0)
            })
            .map_err(error)?;
        if !fts5 {
            return Err("当前 SQLite 缺少 FTS5 支持，请使用项目提供的构建。".into());
        }
        connection.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)").map_err(error)?;
        let applied = {
            let mut statement = connection
                .prepare("SELECT version,checksum FROM schema_migrations ORDER BY version")
                .map_err(error)?;
            statement
                .query_map([], |row| {
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
                })
                .map_err(error)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(error)?
        };
        for (index, (version, checksum)) in applied.iter().enumerate() {
            if *version != (index + 1) as i64
                || MIGRATIONS
                    .get(index)
                    .is_none_or(|sql| hash(sql) != *checksum)
            {
                return Err("数据库版本或迁移校验不匹配。请保留数据并使用兼容的应用版本。".into());
            }
        }
        if applied.len() < MIGRATIONS.len() {
            if !applied.is_empty() {
                let backup = directory.join(format!(
                    "before-migration-{}-{}.sqlite3",
                    applied.len() + 1,
                    new_id()
                ));
                connection
                    .execute("VACUUM INTO ?1", params![backup.to_string_lossy()])
                    .map_err(|_| {
                        "升级前备份失败，请检查磁盘空间与权限；原数据库未升级。".to_string()
                    })?;
            }
            let transaction = connection.transaction().map_err(error)?;
            for (index, sql) in MIGRATIONS.iter().enumerate().skip(applied.len()) {
                transaction.execute_batch(sql).map_err(error)?;
                transaction
                    .execute(
                        "INSERT INTO schema_migrations VALUES(?1,?2,?3)",
                        params![(index + 1) as i64, hash(sql), now()],
                    )
                    .map_err(error)?;
            }
            transaction.commit().map_err(error)?;
        }
        let database = Self {
            connection: Mutex::new(connection),
            path,
            _lock: lock,
        };
        database.recover_interrupted()?;
        Ok(database)
    }

    pub(crate) fn connection(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.connection
            .lock()
            .map_err(|_| "本地数据连接不可用，请重启应用。".into())
    }

    pub fn settings(&self) -> AppResult<ModelSettings> {
        let value: Option<String> = self
            .connection()?
            .query_row(
                "SELECT value_json FROM app_settings WHERE key='model'",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(error)?;
        let settings = match value {
            Some(value) => serde_json::from_str(&value).map_err(json_error)?,
            None => ModelSettings::default(),
        };
        settings.validate()?;
        Ok(settings)
    }

    pub fn save_settings(&self, settings: &ModelSettings) -> AppResult<ModelSettings> {
        settings.validate()?;
        self.connection()?.execute("INSERT INTO app_settings(key,value_json) VALUES('model',?1) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json",
            params![serde_json::to_string(settings).map_err(json_error)?]).map_err(error)?;
        Ok(settings.clone())
    }

    pub fn bootstrap(&self) -> AppResult<Bootstrap> {
        let workspaces = {
            let connection = self.connection()?;
            let mut statement = connection
                .prepare("SELECT id,name,created_at FROM workspaces ORDER BY created_at,id")
                .map_err(error)?;
            statement
                .query_map([], |r| {
                    Ok(Workspace {
                        id: r.get(0)?,
                        name: r.get(1)?,
                        created_at: r.get(2)?,
                    })
                })
                .map_err(error)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(error)?
        };
        let active_run = self
            .connection()?
            .query_row(
                &format!("SELECT {RUN_COLUMNS} FROM execution_runs WHERE status='running'"),
                [],
                read_run,
            )
            .optional()
            .map_err(error)?;
        Ok(Bootstrap {
            workspaces,
            settings: self.settings()?,
            active_run,
            data_path: self.path.to_string_lossy().into_owned(),
        })
    }

    pub fn create_workspace(&self, name: &str) -> AppResult<Workspace> {
        let workspace = Workspace {
            id: new_id(),
            name: validate_name(name)?,
            created_at: now(),
        };
        self.connection()?
            .execute(
                "INSERT INTO workspaces VALUES(?1,?2,?3,?3)",
                params![workspace.id, workspace.name, workspace.created_at],
            )
            .map_err(error)?;
        Ok(workspace)
    }

    pub fn conversations(&self, workspace_id: &str) -> AppResult<Vec<Conversation>> {
        let connection = self.connection()?;
        if !connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM workspaces WHERE id=?1)",
                params![workspace_id],
                |r| r.get::<_, bool>(0),
            )
            .map_err(error)?
        {
            return Err(missing());
        }
        let mut statement = connection.prepare("SELECT id,workspace_id,title,updated_at FROM conversations WHERE workspace_id=?1 ORDER BY updated_at DESC,id").map_err(error)?;
        statement
            .query_map(params![workspace_id], |r| {
                Ok(Conversation {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    title: r.get(2)?,
                    updated_at: r.get(3)?,
                })
            })
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)
    }

    pub fn create_conversation(&self, workspace_id: &str) -> AppResult<Conversation> {
        self.conversations(workspace_id)?;
        let conversation = Conversation {
            id: new_id(),
            workspace_id: workspace_id.into(),
            title: "新对话".into(),
            updated_at: now(),
        };
        self.connection()?
            .execute(
                "INSERT INTO conversations VALUES(?1,?2,?3,?4,?4)",
                params![
                    conversation.id,
                    workspace_id,
                    conversation.title,
                    conversation.updated_at
                ],
            )
            .map_err(error)?;
        Ok(conversation)
    }

    pub fn rename_conversation(
        &self,
        workspace_id: &str,
        conversation_id: &str,
        title: &str,
    ) -> AppResult<()> {
        let affected = self
            .connection()?
            .execute(
                "UPDATE conversations SET title=?1,updated_at=?2 WHERE workspace_id=?3 AND id=?4",
                params![validate_name(title)?, now(), workspace_id, conversation_id],
            )
            .map_err(error)?;
        if affected == 0 {
            return Err(missing());
        }
        Ok(())
    }

    pub fn messages(&self, workspace_id: &str, conversation_id: &str) -> AppResult<Vec<Message>> {
        let connection = self.connection()?;
        if !connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM conversations WHERE workspace_id=?1 AND id=?2)",
                params![workspace_id, conversation_id],
                |r| r.get::<_, bool>(0),
            )
            .map_err(error)?
        {
            return Err(missing());
        }
        let mut statement = connection.prepare("SELECT id,workspace_id,conversation_id,role,content,status,model_run_id,created_at,
          CASE WHEN role='assistant' THEN (SELECT json_extract(e.payload_json,'$.metrics.finishReason') FROM execution_events e WHERE e.run_id=messages.model_run_id AND e.kind='response_completed' LIMIT 1) END
          FROM messages WHERE workspace_id=?1 AND conversation_id=?2 ORDER BY seq").map_err(error)?;
        statement
            .query_map(params![workspace_id, conversation_id], |r| {
                Ok(Message {
                    id: r.get(0)?,
                    workspace_id: r.get(1)?,
                    conversation_id: r.get(2)?,
                    role: r.get(3)?,
                    content: r.get(4)?,
                    status: r.get(5)?,
                    model_run_id: r.get(6)?,
                    created_at: r.get(7)?,
                    finish_reason: r.get(8)?,
                })
            })
            .map_err(error)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(error)
    }

    pub fn prepare_run(
        &self,
        run_id: &str,
        workspace_id: &str,
        conversation_id: &str,
        content: &str,
        settings: &ModelSettings,
    ) -> AppResult<PreparedRun> {
        settings.validate()?;
        let content = content.trim();
        let history = self.messages(workspace_id, conversation_id)?;
        let completed_runs = {
            let connection = self.connection()?;
            let mut statement=connection.prepare("SELECT id FROM execution_runs WHERE workspace_id=?1 AND conversation_id=?2 AND status='completed'").map_err(error)?;
            statement
                .query_map(params![workspace_id, conversation_id], |row| {
                    row.get::<_, String>(0)
                })
                .map_err(error)?
                .collect::<rusqlite::Result<std::collections::HashSet<_>>>()
                .map_err(error)?
        };
        let user_id = new_id();
        let budget = (settings.num_ctx - settings.num_predict - 256) as usize;
        let mut used = SYSTEM_PROMPT.len() + content.len() + 64;
        if content.is_empty() || used > budget {
            return Err("这条消息为空或过长，请缩短问题或在设置中增加上下文长度。".into());
        }
        let mut selected = Vec::new();
        for turn in history.chunks_exact(2).rev().filter(|turn| {
            turn.iter().all(|message| {
                message.status == "completed"
                    && message.finish_reason.as_deref() != Some("length")
                    && message
                        .model_run_id
                        .as_ref()
                        .is_some_and(|id| completed_runs.contains(id))
            })
        }) {
            let cost = turn
                .iter()
                .map(|message| message.content.len() + 32)
                .sum::<usize>();
            if selected.len() >= 20 || used + cost > budget {
                break;
            }
            selected.extend(turn.iter().rev());
            used += cost;
        }
        selected.reverse();
        let mut messages = vec![ChatMessage {
            role: "system".into(),
            content: SYSTEM_PROMPT.into(),
        }];
        let mut references = Vec::new();
        for message in selected {
            messages.push(ChatMessage {
                role: message.role.clone(),
                content: message.content.clone(),
            });
            references.push(json!({"messageId":message.id,"contentHash":hash(&message.content)}));
        }
        messages.push(ChatMessage {
            role: "user".into(),
            content: content.into(),
        });
        references.push(json!({"messageId":user_id,"contentHash":hash(content)}));
        let manifest = json!({"strategy":"recent_messages_utf8_budget","estimatedUnits":used,"budgetUnits":budget,
            "estimateNote":"按 UTF-8 字节保守估算，不是模型精确 token 数","systemVersion":1,"systemHash":hash(SYSTEM_PROMPT),"messageRefs":references,"retrievalUsed":false});
        let run = RunSummary {
            id: run_id.into(),
            workspace_id: workspace_id.into(),
            conversation_id: conversation_id.into(),
            assistant_message_id: new_id(),
            model_id: settings.model.clone(),
            status: "running".into(),
            started_at: now(),
            finished_at: None,
            error_message: None,
        };
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(error)?;
        transaction.execute("INSERT INTO execution_runs(id,workspace_id,conversation_id,assistant_message_id,model_id,model_config_json,context_manifest_json,status,started_at) VALUES(?1,?2,?3,?4,?5,?6,?7,'running',?8)",
            params![run.id,workspace_id,conversation_id,run.assistant_message_id,settings.model,serde_json::to_string(settings).map_err(json_error)?,manifest.to_string(),run.started_at]).map_err(error)?;
        let seq: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(seq),0)+1 FROM messages WHERE conversation_id=?1",
                params![conversation_id],
                |r| r.get(0),
            )
            .map_err(error)?;
        transaction
            .execute(
                "INSERT INTO messages VALUES(?1,?2,?3,?4,'user',?5,'completed',?6,?7,?7)",
                params![
                    user_id,
                    workspace_id,
                    conversation_id,
                    seq,
                    content,
                    run.id,
                    run.started_at
                ],
            )
            .map_err(error)?;
        transaction
            .execute(
                "INSERT INTO messages VALUES(?1,?2,?3,?4,'assistant','','streaming',?5,?6,?6)",
                params![
                    run.assistant_message_id,
                    workspace_id,
                    conversation_id,
                    seq + 1,
                    run.id,
                    run.started_at
                ],
            )
            .map_err(error)?;
        transaction.execute("UPDATE conversations SET title=CASE WHEN title='新对话' THEN ?1 ELSE title END,updated_at=?2 WHERE workspace_id=?3 AND id=?4",params![content.chars().take(24).collect::<String>(),run.started_at,workspace_id,conversation_id]).map_err(error)?;
        event(
            &transaction,
            run_id,
            "request_received",
            json!({"userMessageId":user_id}),
        )?;
        event(&transaction, run_id, "context_prepared", manifest)?;
        transaction.commit().map_err(error)?;
        Ok(PreparedRun { run, messages })
    }

    pub fn model_called(&self, run_id: &str) -> AppResult<()> {
        let connection = self.connection()?;
        event(
            &connection,
            run_id,
            "model_called",
            json!({"provider":"ollama","transport":"loopback"}),
        )
    }

    pub fn checkpoint(&self, run_id: &str, content: &str) -> AppResult<()> {
        self.connection()?.execute("UPDATE messages SET content=?1,updated_at=?2 WHERE model_run_id=?3 AND role='assistant' AND EXISTS(SELECT 1 FROM execution_runs WHERE id=?3 AND status='running')",params![content,now(),run_id]).map_err(error)?;
        Ok(())
    }

    pub fn finish(
        &self,
        run: &RunSummary,
        content: &str,
        status: &str,
        message: Option<&str>,
        metrics: Value,
    ) -> AppResult<()> {
        let event_kind = match status {
            "completed" => "response_completed",
            "cancelled" => "run_cancelled",
            "failed" => "run_failed",
            "interrupted" => "run_interrupted",
            _ => return Err("无效的运行结束状态。".into()),
        };
        let mut connection = self.connection()?;
        let transaction = connection.transaction().map_err(error)?;
        let time = now();
        let updated = transaction.execute("UPDATE execution_runs SET status=?1,error_message=?2,finished_at=?3 WHERE id=?4 AND workspace_id=?5 AND status='running'",params![status,message,time,run.id,run.workspace_id]).map_err(error)?;
        if updated == 1 {
            transaction.execute("UPDATE messages SET content=?1,status=?2,updated_at=?3 WHERE id=?4 AND workspace_id=?5",params![content,status,time,run.assistant_message_id,run.workspace_id]).map_err(error)?;
            transaction
                .execute(
                    "UPDATE conversations SET updated_at=?1 WHERE workspace_id=?2 AND id=?3",
                    params![time, run.workspace_id, run.conversation_id],
                )
                .map_err(error)?;
            event(
                &transaction,
                &run.id,
                event_kind,
                json!({"errorMessage":message,"metrics":metrics}),
            )?;
        }
        transaction.commit().map_err(error)?;
        Ok(())
    }

    pub fn run_detail(&self, workspace_id: &str, run_id: &str) -> AppResult<RunDetail> {
        let connection = self.connection()?;
        let run = connection
            .query_row(
                &format!(
                    "SELECT {RUN_COLUMNS} FROM execution_runs WHERE workspace_id=?1 AND id=?2"
                ),
                params![workspace_id, run_id],
                read_run,
            )
            .optional()
            .map_err(error)?
            .ok_or_else(missing)?;
        let (settings,manifest):(String,String) = connection.query_row("SELECT model_config_json,context_manifest_json FROM execution_runs WHERE workspace_id=?1 AND id=?2",params![workspace_id,run_id],|r| Ok((r.get(0)?,r.get(1)?))).map_err(error)?;
        let events = {
            let mut statement = connection.prepare("SELECT seq,kind,occurred_at,payload_json FROM execution_events WHERE run_id=?1 ORDER BY seq").map_err(error)?;
            let rows = statement
                .query_map(params![run_id], |r| {
                    Ok((
                        r.get::<_, u32>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                    ))
                })
                .map_err(error)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(error)?;
            rows.into_iter()
                .map(|(seq, kind, occurred_at, payload)| {
                    Ok(ExecutionEvent {
                        seq,
                        kind,
                        occurred_at,
                        payload: serde_json::from_str(&payload).map_err(json_error)?,
                    })
                })
                .collect::<AppResult<Vec<_>>>()?
        };
        Ok(RunDetail {
            run,
            settings: serde_json::from_str(&settings).map_err(json_error)?,
            context_manifest: serde_json::from_str(&manifest).map_err(json_error)?,
            events,
        })
    }

    fn recover_interrupted(&self) -> AppResult<()> {
        let runs = {
            let connection = self.connection()?;
            let mut statement = connection
                .prepare(&format!(
                    "SELECT {RUN_COLUMNS} FROM execution_runs WHERE status='running'"
                ))
                .map_err(error)?;
            statement
                .query_map([], read_run)
                .map_err(error)?
                .collect::<rusqlite::Result<Vec<_>>>()
                .map_err(error)?
        };
        for run in runs {
            let content: String = self
                .connection()?
                .query_row(
                    "SELECT content FROM messages WHERE id=?1",
                    params![run.assistant_message_id],
                    |r| r.get(0),
                )
                .map_err(error)?;
            self.finish(
                &run,
                &content,
                "interrupted",
                Some("上次运行意外中断，已保留最后一次写入的内容。"),
                json!({}),
            )?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_isolates_workspaces_preserves_partial_and_recovers_after_restart() {
        let directory = std::env::temp_dir().join(format!("cortexos-db-{}", new_id()));
        let (workspace_id, conversation_id, run_id, original_event_count) = {
            let database = Database::open(&directory).unwrap();
            let workspace = database.create_workspace("项目 A").unwrap();
            let other = database.create_workspace("项目 B").unwrap();
            let conversation = database.create_conversation(&workspace.id).unwrap();
            assert!(database.messages(&other.id, &conversation.id).is_err());
            assert!(
                database
                    .rename_conversation(&other.id, &conversation.id, "越界")
                    .is_err()
            );
            let prepared = database
                .prepare_run(
                    &new_id(),
                    &workspace.id,
                    &conversation.id,
                    "你好",
                    &ModelSettings::default(),
                )
                .unwrap();
            assert!(
                database
                    .prepare_run(
                        &new_id(),
                        &other.id,
                        &conversation.id,
                        "越界",
                        &ModelSettings::default()
                    )
                    .is_err()
            );
            assert!(database.run_detail(&other.id, &prepared.run.id).is_err());
            database.model_called(&prepared.run.id).unwrap();
            database.checkpoint(&prepared.run.id, "部分回答").unwrap();
            assert!(
                database
                    .prepare_run(
                        &new_id(),
                        &workspace.id,
                        &conversation.id,
                        "不能并发",
                        &ModelSettings::default()
                    )
                    .is_err()
            );
            assert_eq!(
                database
                    .messages(&workspace.id, &conversation.id)
                    .unwrap()
                    .len(),
                2
            );
            #[cfg(windows)]
            assert!(Database::open(&directory).is_err());
            assert!(
                database
                    .connection()
                    .unwrap()
                    .execute("UPDATE execution_events SET kind='fake'", [])
                    .is_err()
            );
            assert!(
                database
                    .connection()
                    .unwrap()
                    .execute("DELETE FROM execution_events", [])
                    .is_err()
            );
            let count = database
                .run_detail(&workspace.id, &prepared.run.id)
                .unwrap()
                .events
                .len();
            (workspace.id, conversation.id, prepared.run.id, count)
        };
        {
            let database = Database::open(&directory).unwrap();
            let messages = database.messages(&workspace_id, &conversation_id).unwrap();
            assert_eq!(messages[1].content, "部分回答");
            assert_eq!(messages[1].status, "interrupted");
            let detail = database.run_detail(&workspace_id, &run_id).unwrap();
            assert_eq!(detail.events.len(), original_event_count + 1);
            assert_eq!(detail.events.last().unwrap().kind, "run_interrupted");
            database
                .finish(&detail.run, "不得覆盖", "completed", None, json!({}))
                .unwrap();
            assert_eq!(
                database.messages(&workspace_id, &conversation_id).unwrap()[1].content,
                "部分回答"
            );
            assert!(
                database
                    .connection()
                    .unwrap()
                    .query_row("PRAGMA foreign_key_check", [], |_| Ok(()))
                    .optional()
                    .unwrap()
                    .is_none()
            );
        }
        for name in [
            "cortexos.sqlite3",
            "cortexos.sqlite3-wal",
            "cortexos.sqlite3-shm",
            "cortexos.lock",
        ] {
            let _ = std::fs::remove_file(directory.join(name));
        }
        std::fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn context_and_config_are_validated_before_persisting_a_run() {
        let directory = std::env::temp_dir().join(format!("cortexos-db-{}", new_id()));
        {
            let database = Database::open(&directory).unwrap();
            let workspace = database.create_workspace("测试").unwrap();
            let conversation = database.create_conversation(&workspace.id).unwrap();
            assert!(
                database
                    .prepare_run(
                        &new_id(),
                        &workspace.id,
                        &conversation.id,
                        &"长".repeat(5000),
                        &ModelSettings::default()
                    )
                    .is_err()
            );
            assert!(
                database
                    .messages(&workspace.id, &conversation.id)
                    .unwrap()
                    .is_empty()
            );
            let invalid = ModelSettings {
                num_predict: 4096,
                ..Default::default()
            };
            assert!(database.save_settings(&invalid).is_err());
            let prepared = database
                .prepare_run(
                    &new_id(),
                    &workspace.id,
                    &conversation.id,
                    "正常问题",
                    &ModelSettings::default(),
                )
                .unwrap();
            database
                .finish(
                    &prepared.run,
                    "回答",
                    "completed",
                    None,
                    json!({"evalCount":2}),
                )
                .unwrap();
            database.checkpoint(&prepared.run.id, "迟到的片段").unwrap();
            assert_eq!(
                database.messages(&workspace.id, &conversation.id).unwrap()[1].content,
                "回答"
            );
            let detail = database
                .run_detail(&workspace.id, &prepared.run.id)
                .unwrap();
            assert_eq!(detail.context_manifest["retrievalUsed"], false);
            assert_eq!(detail.events.last().unwrap().kind, "response_completed");
            let small_context = ModelSettings {
                num_ctx: 1024,
                num_predict: 32,
                ..Default::default()
            };
            let next = database
                .prepare_run(
                    &new_id(),
                    &workspace.id,
                    &conversation.id,
                    "继续",
                    &small_context,
                )
                .unwrap();
            assert_eq!(
                next.messages
                    .iter()
                    .map(|message| message.role.as_str())
                    .collect::<Vec<_>>(),
                ["system", "user", "assistant", "user"]
            );
            database
                .finish(&next.run, &"答".repeat(300), "completed", None, json!({}))
                .unwrap();
            let bounded = database
                .prepare_run(
                    &new_id(),
                    &workspace.id,
                    &conversation.id,
                    "新的问题",
                    &small_context,
                )
                .unwrap();
            assert_eq!(
                bounded
                    .messages
                    .iter()
                    .map(|message| message.role.as_str())
                    .collect::<Vec<_>>(),
                ["system", "user"]
            );
            database
                .finish(&bounded.run, "完成", "completed", None, json!({}))
                .unwrap();
        }
        {
            let connection = Connection::open(directory.join("cortexos.sqlite3")).unwrap();
            connection
                .execute("UPDATE schema_migrations SET checksum='mismatched'", [])
                .unwrap();
        }
        assert!(Database::open(&directory).is_err());
        {
            let connection = Connection::open(directory.join("cortexos.sqlite3")).unwrap();
            assert_eq!(
                connection
                    .query_row("SELECT COUNT(*) FROM messages", [], |row| row
                        .get::<_, i64>(0))
                    .unwrap(),
                6
            );
        }
        for name in [
            "cortexos.sqlite3",
            "cortexos.sqlite3-wal",
            "cortexos.sqlite3-shm",
            "cortexos.lock",
        ] {
            let _ = std::fs::remove_file(directory.join(name));
        }
        std::fs::remove_dir(directory).unwrap();
    }
}
