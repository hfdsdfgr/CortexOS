use serde::{Deserialize, Serialize};

pub type AppResult<T> = Result<T, String>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ModelSettings {
    pub model: String,
    pub num_ctx: u32,
    pub temperature: f64,
    pub num_predict: u32,
    pub timeout_seconds: u64,
}

impl Default for ModelSettings {
    fn default() -> Self {
        Self {
            model: "qwen3:4b-instruct".into(),
            num_ctx: 4096,
            temperature: 0.3,
            num_predict: 512,
            timeout_seconds: 180,
        }
    }
}

impl ModelSettings {
    pub fn validate(&self) -> AppResult<()> {
        if self.model.trim().is_empty()
            || self.model.len() > 200
            || self.model.chars().any(char::is_control)
        {
            return Err("请选择有效的本地模型。".into());
        }
        if !(1024..=16384).contains(&self.num_ctx)
            || !(32..=2048).contains(&self.num_predict)
            || self.num_predict + 512 >= self.num_ctx
            || !self.temperature.is_finite()
            || !(0.0..=2.0).contains(&self.temperature)
            || !(30..=600).contains(&self.timeout_seconds)
        {
            return Err("请检查生成参数：上下文 1024–16384，输出 32–2048，温度 0–2，超时 30–600 秒；上下文需留出生成空间。".into());
        }
        Ok(())
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Conversation {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub updated_at: String,
    pub auto_retrieval: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub workspace_id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub status: String,
    pub model_run_id: Option<String>,
    pub created_at: String,
    pub finish_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSummary {
    pub id: String,
    pub workspace_id: String,
    pub conversation_id: String,
    pub assistant_message_id: String,
    pub model_id: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionEvent {
    pub seq: u32,
    pub kind: String,
    pub occurred_at: String,
    pub payload: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunDetail {
    pub run: RunSummary,
    pub settings: ModelSettings,
    pub context_manifest: serde_json::Value,
    pub snapshot: Option<ContextSnapshot>,
    pub events: Vec<ExecutionEvent>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    pub workspaces: Vec<Workspace>,
    pub settings: ModelSettings,
    pub active_run: Option<RunSummary>,
    pub data_path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone, Debug)]
pub struct PreparedRun {
    pub run: RunSummary,
    pub request: serde_json::Value,
    pub manifest: serde_json::Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamUpdate {
    pub workspace_id: String,
    pub conversation_id: String,
    pub run_id: String,
    pub message_id: String,
    pub seq: u64,
    pub content: String,
    pub status: String,
    pub error_message: Option<String>,
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub fn validate_name(value: &str) -> AppResult<String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 80 || value.chars().any(char::is_control) {
        return Err("名称需为 1–80 个字符，且不能包含控制字符。".into());
    }
    Ok(value.into())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContextSelection {
    pub node_id: String,
    pub version: i64,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshot {
    pub request: serde_json::Value,
    pub request_hash: String,
    pub manifest: serde_json::Value,
}
