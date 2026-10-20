use crate::{
    db::Database,
    models::*,
    ollama::{ModelHealth, Ndjson, Ollama},
};
use serde_json::json;
use std::{
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri::{State, ipc::Channel};
use tokio::sync::watch;

#[derive(Clone)]
pub struct AppState {
    pub database: AppResult<Arc<Database>>,
    provider: AppResult<Ollama>,
    active: Arc<Mutex<Option<ActiveRun>>>,
    pub closing: Arc<AtomicBool>,
    pending_source: Arc<Mutex<Option<crate::sources::PendingSource>>>,
}

struct ActiveRun {
    id: String,
    workspace_id: String,
    cancel: watch::Sender<bool>,
}

impl AppState {
    pub fn new(directory: &Path) -> Self {
        Self {
            database: Database::open(directory).map(Arc::new),
            pending_source: Arc::new(Mutex::new(None)),
            provider: Ollama::new(),
            active: Arc::new(Mutex::new(None)),
            closing: Arc::new(AtomicBool::new(false)),
        }
    }
    pub fn has_active(&self) -> bool {
        self.active
            .lock()
            .map(|active| active.is_some())
            .unwrap_or(true)
    }
    pub fn cancel_active(&self) {
        if let Ok(active) = self.active.lock() {
            if let Some(active) = active.as_ref() {
                let _ = active.cancel.send(true);
            }
        }
    }
    fn clear(&self, id: &str) {
        if let Ok(mut active) = self.active.lock() {
            if active.as_ref().is_some_and(|run| run.id == id) {
                *active = None;
            }
        }
    }
}

async fn blocking<T: Send + 'static>(
    database: Arc<Database>,
    operation: impl FnOnce(&Database) -> AppResult<T> + Send + 'static,
) -> AppResult<T> {
    tauri::async_runtime::spawn_blocking(move || operation(&database))
        .await
        .map_err(|_| "本地数据任务意外结束，请保留草稿并重试。".to_string())?
}

#[tauri::command]
pub async fn bootstrap(state: State<'_, AppState>) -> AppResult<Bootstrap> {
    blocking(state.database.clone()?, |db| db.bootstrap()).await
}

#[tauri::command]
pub async fn create_workspace(state: State<'_, AppState>, name: String) -> AppResult<Workspace> {
    blocking(state.database.clone()?, move |db| {
        db.create_workspace(&name)
    })
    .await
}

#[tauri::command]
pub async fn list_conversations(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Vec<Conversation>> {
    blocking(state.database.clone()?, move |db| {
        db.conversations(&workspace_id)
    })
    .await
}

#[tauri::command]
pub async fn create_conversation(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Conversation> {
    blocking(state.database.clone()?, move |db| {
        db.create_conversation(&workspace_id)
    })
    .await
}

#[tauri::command]
pub async fn rename_conversation(
    state: State<'_, AppState>,
    workspace_id: String,
    conversation_id: String,
    title: String,
) -> AppResult<()> {
    blocking(state.database.clone()?, move |db| {
        db.rename_conversation(&workspace_id, &conversation_id, &title)
    })
    .await
}

#[tauri::command]
pub async fn load_messages(
    state: State<'_, AppState>,
    workspace_id: String,
    conversation_id: String,
) -> AppResult<Vec<Message>> {
    blocking(state.database.clone()?, move |db| {
        db.messages(&workspace_id, &conversation_id)
    })
    .await
}

#[tauri::command]
pub async fn check_ollama(state: State<'_, AppState>) -> AppResult<ModelHealth> {
    state
        .provider
        .as_ref()
        .map_err(Clone::clone)?
        .health()
        .await
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: ModelSettings,
) -> AppResult<ModelSettings> {
    blocking(state.database.clone()?, move |db| {
        db.save_settings(&settings)
    })
    .await
}

#[tauri::command]
pub async fn get_run(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: String,
) -> AppResult<RunDetail> {
    blocking(state.database.clone()?, move |db| {
        db.run_detail(&workspace_id, &run_id)
    })
    .await
}

#[tauri::command]
pub async fn cancel_run(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: String,
) -> AppResult<()> {
    let active = state
        .active
        .lock()
        .map_err(|_| "生成状态不可用。".to_string())?;
    let Some(active) = active.as_ref() else {
        return Ok(());
    };
    if active.id != run_id || active.workspace_id != workspace_id {
        return Err("该运行不属于当前工作区，或已有其他运行。".into());
    }
    active
        .cancel
        .send(true)
        .map_err(|_| "该运行已经结束。".into())
}

#[tauri::command]
pub async fn start_chat(
    state: State<'_, AppState>,
    workspace_id: String,
    conversation_id: String,
    content: String,
    context_selection: Option<Vec<ContextSelection>>,
    on_update: Channel<StreamUpdate>,
) -> AppResult<RunSummary> {
    if state.closing.load(Ordering::SeqCst) {
        return Err("正在关闭应用，请等待当前内容保存。".into());
    }
    let database = state.database.clone()?;
    let provider = state.provider.clone()?;
    let id = new_id();
    let (cancel, receiver) = watch::channel(false);
    {
        let mut active = state
            .active
            .lock()
            .map_err(|_| "生成状态不可用。".to_string())?;
        if active.is_some() {
            return Err("已有一个回答正在生成。请先停止或等待完成。".into());
        }
        *active = Some(ActiveRun {
            id: id.clone(),
            workspace_id: workspace_id.clone(),
            cancel,
        });
    }
    let settings = match blocking(database.clone(), |db| db.settings()).await {
        Ok(settings) => settings,
        Err(error) => {
            state.clear(&id);
            return Err(error);
        }
    };
    let prepare_id = id.clone();
    let model_settings = settings.clone();
    let prepared = match blocking(database.clone(), move |db| {
        db.prepare_context_run(
            &prepare_id,
            &workspace_id,
            &conversation_id,
            &content,
            &model_settings,
            &context_selection.unwrap_or_default(),
            false,
        )
    })
    .await
    {
        Ok(prepared) => prepared,
        Err(error) => {
            state.clear(&id);
            return Err(error);
        }
    };
    let result = prepared.run.clone();
    let worker_state = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        generate(
            worker_state,
            database,
            provider,
            prepared,
            settings,
            receiver,
            on_update,
        )
        .await;
    });
    Ok(result)
}

async fn generate(
    state: AppState,
    database: Arc<Database>,
    provider: Ollama,
    prepared: PreparedRun,
    settings: ModelSettings,
    mut cancel: watch::Receiver<bool>,
    channel: Channel<StreamUpdate>,
) {
    let run = prepared.run;
    let mut content = String::new();
    let mut seq = 0u64;
    let result = {
        let generation = async {
            let id = run.id.clone();
            blocking(database.clone(), move |db| {
                db.record_event(
                    &id,
                    "model_inspection_started",
                    json!({"provider":"ollama","transport":"loopback"}),
                )
            })
            .await?;
            let inspected = provider.inspect(&settings).await?;
            let id = run.id.clone();
            blocking(database.clone(), move |db| {
                db.record_event(&id, "model_inspection_completed", inspected)
            })
            .await?;
            let id = run.id.clone();
            blocking(database.clone(), move |db| {
                db.record_event(
                    &id,
                    "model_request_started",
                    json!({"endpoint":"/api/chat"}),
                )
            })
            .await?;
            let mut response = provider.chat(&settings, &prepared.request).await?;
            let id = run.id.clone();
            blocking(database.clone(), move |db| {
                db.record_event(&id, "model_response_received", json!({"status":200}))
            })
            .await?;
            let mut parser = Ndjson::default();
            let mut checkpoint = tokio::time::interval(Duration::from_millis(250));
            let mut dirty = false;
            loop {
                let chunk = tokio::select! {
                    chunk=response.chunk()=>chunk.map_err(|_| "模型连接中断，已保留收到的内容。请重试。".to_string())?,
                    _=checkpoint.tick()=>{
                        if dirty {
                            let (id,text)=(run.id.clone(),content.clone());
                            blocking(database.clone(),move|db|db.checkpoint(&id,&text)).await?;
                            dirty=false;
                        }
                        continue;
                    }
                };
                let frames = match chunk.as_ref() {
                    Some(bytes) => parser.push(bytes),
                    None => parser.finish(),
                };
                for frame in frames {
                    let frame = frame?;
                    if let Some(message) = frame.message.as_ref() {
                        content.push_str(&message.content);
                        dirty |= !message.content.is_empty();
                    }
                    if content.len() > 1024 * 1024 {
                        return Err("模型输出超出安全长度，已停止生成。".into());
                    }
                    seq += 1;
                    let _ = channel.send(update(&run, seq, &content, "running", None));
                    if frame.done {
                        if content.trim().is_empty() {
                            return Err("模型没有返回可用文字，请换一个模型或重试。".into());
                        }
                        return Ok(frame.metrics());
                    }
                }
                if chunk.is_none() {
                    return Err("回答流提前结束，已保留收到的内容。请重试。".into());
                }
            }
        };
        tokio::select! {
            biased;
            _=cancel.changed()=>Err("__cancelled__".into()),
            _=tokio::time::sleep(Duration::from_secs(settings.timeout_seconds))=>Err("生成超时，已保留收到的内容。可以增加超时、缩短问题或换较小模型后重试。".into()),
            result=generation=>result,
        }
    };
    let (status, mut message, metrics) = match result {
        Ok(metrics) => ("completed", None, metrics),
        Err(error) if error == "__cancelled__" => ("cancelled", None, json!({})),
        Err(error) => ("failed", Some(error), json!({})),
    };
    let (saved_run, saved_content, saved_message) = (run.clone(), content.clone(), message.clone());
    if let Err(error) = blocking(database, move |db| {
        db.finish(
            &saved_run,
            &saved_content,
            status,
            saved_message.as_deref(),
            metrics,
        )
    })
    .await
    {
        message = Some(format!(
            "{error} 当前回答仍在窗口中，可先复制；请检查磁盘空间。"
        ));
    }
    state.clear(&run.id);
    let _ = channel.send(update(
        &run,
        seq + 1,
        &content,
        if message.is_some() { "failed" } else { status },
        message,
    ));
}

fn update(
    run: &RunSummary,
    seq: u64,
    content: &str,
    status: &str,
    error_message: Option<String>,
) -> StreamUpdate {
    StreamUpdate {
        workspace_id: run.workspace_id.clone(),
        conversation_id: run.conversation_id.clone(),
        run_id: run.id.clone(),
        message_id: run.assistant_message_id.clone(),
        seq,
        content: content.into(),
        status: status.into(),
        error_message,
    }
}

#[tauri::command]
pub async fn list_knowledge(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Vec<crate::knowledge::KnowledgeNode>> {
    blocking(state.database.clone()?, move |db| {
        db.knowledge_list(&workspace_id)
    })
    .await
}
#[tauri::command]
pub async fn get_knowledge(
    state: State<'_, AppState>,
    workspace_id: String,
    node_id: String,
) -> AppResult<crate::knowledge::KnowledgeDetail> {
    blocking(state.database.clone()?, move |db| {
        db.knowledge_detail(&workspace_id, &node_id)
    })
    .await
}
#[tauri::command]
pub async fn save_knowledge(
    state: State<'_, AppState>,
    input: crate::knowledge::SaveKnowledge,
) -> AppResult<String> {
    blocking(state.database.clone()?, move |db| db.save_knowledge(input)).await
}
#[tauri::command]
pub async fn approve_knowledge(
    state: State<'_, AppState>,
    workspace_id: String,
    node_id: String,
    expected_revision: i64,
) -> AppResult<()> {
    blocking(state.database.clone()?, move |db| {
        db.approve_knowledge(&workspace_id, &node_id, expected_revision)
    })
    .await
}

#[tauri::command]
pub async fn load_knowledge_graph(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<crate::graph::KnowledgeGraph> {
    blocking(state.database.clone()?, move |db| {
        db.knowledge_graph(&workspace_id)
    })
    .await
}
#[tauri::command]
pub async fn save_knowledge_edge(
    state: State<'_, AppState>,
    input: crate::graph::SaveEdge,
) -> AppResult<String> {
    blocking(state.database.clone()?, move |db| {
        db.save_knowledge_edge(input)
    })
    .await
}
#[tauri::command]
pub async fn save_graph_view(
    state: State<'_, AppState>,
    input: crate::graph::SaveGraphView,
) -> AppResult<i64> {
    blocking(state.database.clone()?, move |db| db.save_graph_view(input)).await
}

#[tauri::command]
pub async fn preview_context(
    state: State<'_, AppState>,
    workspace_id: String,
    conversation_id: Option<String>,
    content: String,
    context_selection: Vec<ContextSelection>,
) -> AppResult<serde_json::Value> {
    blocking(state.database.clone()?, move |db| {
        let settings = db.settings()?;
        Ok(db
            .prepare_context_run(
                &new_id(),
                &workspace_id,
                &conversation_id.unwrap_or_default(),
                &content,
                &settings,
                &context_selection,
                true,
            )?
            .manifest)
    })
    .await
}

#[tauri::command]
pub async fn list_runs(
    state: State<'_, AppState>,
    workspace_id: String,
    offset: Option<u32>,
) -> AppResult<Vec<RunSummary>> {
    blocking(state.database.clone()?, move |db| {
        db.list_runs(&workspace_id, offset.unwrap_or(0))
    })
    .await
}
#[tauri::command]
pub async fn load_execution_graph(
    state: State<'_, AppState>,
    workspace_id: String,
    run_id: String,
) -> AppResult<crate::execution::ExecutionGraph> {
    blocking(state.database.clone()?, move |db| {
        db.execution_graph(&workspace_id, &run_id)
    })
    .await
}
#[tauri::command]
pub async fn save_execution_view(
    state: State<'_, AppState>,
    input: crate::execution::SaveExecutionView,
) -> AppResult<i64> {
    blocking(state.database.clone()?, move |db| {
        db.save_execution_view(input)
    })
    .await
}

#[tauri::command]
pub async fn set_conversation_retrieval(
    state: State<'_, AppState>,
    workspace_id: String,
    conversation_id: String,
    enabled: bool,
) -> AppResult<()> {
    blocking(state.database.clone()?, move |db| {
        db.set_conversation_retrieval(&workspace_id, &conversation_id, enabled)
    })
    .await
}

#[tauri::command]
pub async fn choose_source(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Option<crate::sources::SourcePreview>> {
    use tauri::Manager;
    use tauri_plugin_dialog::DialogExt;
    let database = state.database.clone()?;
    let pending = tauri::async_runtime::spawn_blocking(
        move || -> AppResult<Option<crate::sources::PendingSource>> {
            database.source_previous(&workspace_id, "")?;
            let mut chosen = None;
            #[cfg(debug_assertions)]
            if let (Ok(root), Ok(file)) = (
                std::env::var("CORTEXOS_TEST_DATA_DIR"),
                std::env::var("CORTEXOS_TEST_SOURCE_PATH"),
            ) {
                let root =
                    std::fs::canonicalize(root).map_err(|_| "测试数据目录不存在。".to_string())?;
                let selected_path = std::path::PathBuf::from(&file);
                let file =
                    std::fs::canonicalize(file).map_err(|_| "测试文件不存在。".to_string())?;
                if !file.starts_with(&root) {
                    return Err("测试选择文件必须在隔离测试数据目录内。".into());
                }
                chosen = Some(selected_path);
            }
            let chosen = match chosen {
                Some(file) => Some(file),
                None => {
                    let window = app.get_webview_window("main").ok_or("主窗口不存在。")?;
                    app.dialog()
                        .file()
                        .set_parent(&window)
                        .set_title("选择资料文件")
                        .add_filter("UTF-8 文本", &["txt", "md"])
                        .blocking_pick_file()
                        .map(|file| file.into_path().map_err(|_| "请选择本地文件。".to_string()))
                        .transpose()?
                }
            };
            chosen
                .map(|path| crate::sources::read_selected(&path, &workspace_id, &database))
                .transpose()
        },
    )
    .await
    .map_err(|_| "文件选择未完成，请重试。".to_string())??;
    let preview = pending.as_ref().map(|p| p.preview.clone());
    *state
        .pending_source
        .lock()
        .map_err(|_| "文件预览忙，请重试。".to_string())? = pending;
    Ok(preview)
}
#[tauri::command]
pub async fn commit_source(
    state: State<'_, AppState>,
    workspace_id: String,
    ticket: String,
) -> AppResult<crate::sources::Source> {
    let pending = {
        let mut slot = state
            .pending_source
            .lock()
            .map_err(|_| "文件预览忙，请重试。".to_string())?;
        if !slot.as_ref().is_some_and(|p| {
            p.workspace == workspace_id
                && p.preview.ticket == ticket
                && p.created.elapsed() < Duration::from_secs(600)
        }) {
            return Err("文件预览已失效，请重新添加文件。".into());
        }
        slot.take().unwrap()
    };
    let payload = pending.clone();
    match blocking(state.database.clone()?, move |db| db.import_source(payload)).await {
        Ok(saved) => Ok(saved),
        Err(error) => {
            if let Ok(mut slot) = state.pending_source.lock() {
                if slot.is_none() && pending.created.elapsed() < Duration::from_secs(600) {
                    *slot = Some(pending);
                }
            }
            Err(error)
        }
    }
}
#[tauri::command]
pub async fn list_sources(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Vec<crate::sources::Source>> {
    blocking(state.database.clone()?, move |db| db.sources(&workspace_id)).await
}
#[tauri::command]
pub async fn get_source(
    state: State<'_, AppState>,
    workspace_id: String,
    source_id: String,
    version: i64,
) -> AppResult<crate::sources::Snapshot> {
    blocking(state.database.clone()?, move |db| {
        db.source_snapshot(&workspace_id, &source_id, version)
    })
    .await
}
#[tauri::command]
pub async fn revoke_source(
    state: State<'_, AppState>,
    workspace_id: String,
    source_id: String,
    expected_revision: i64,
) -> AppResult<()> {
    blocking(state.database.clone()?, move |db| {
        db.revoke_source(&workspace_id, &source_id, expected_revision)
    })
    .await
}
#[tauri::command]
pub async fn save_source_knowledge(
    state: State<'_, AppState>,
    input: crate::knowledge::SaveKnowledge,
    source: crate::sources::SourceRef,
) -> AppResult<String> {
    blocking(state.database.clone()?, move |db| {
        db.save_knowledge_with_evidence(input, Some(source))
    })
    .await
}

#[tauri::command]
pub fn discard_source(
    state: State<'_, AppState>,
    workspace_id: String,
    ticket: String,
) -> AppResult<()> {
    let mut pending = state
        .pending_source
        .lock()
        .map_err(|_| "文件预览忙，请重试。".to_string())?;
    if pending
        .as_ref()
        .is_some_and(|p| p.workspace == workspace_id && p.preview.ticket == ticket)
    {
        *pending = None;
    }
    Ok(())
}
