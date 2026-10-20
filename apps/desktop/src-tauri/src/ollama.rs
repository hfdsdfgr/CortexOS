use crate::models::*;
use reqwest::{Client, Response, Url};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;

#[derive(Clone)]
pub struct Ollama {
    client: Client,
    endpoint: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalModel {
    pub name: String,
    pub size: u64,
    pub parameter_size: Option<String>,
    pub quantization: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelHealth {
    pub version: String,
    pub models: Vec<LocalModel>,
}

#[derive(Deserialize)]
pub struct FrameMessage {
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub content: String,
}

#[derive(Deserialize)]
pub struct Frame {
    pub message: Option<FrameMessage>,
    #[serde(default)]
    pub done: bool,
    pub error: Option<String>,
    pub eval_count: Option<u64>,
    pub eval_duration: Option<u64>,
    pub done_reason: Option<String>,
    pub total_duration: Option<u64>,
    pub load_duration: Option<u64>,
    pub prompt_eval_count: Option<u64>,
}

impl Frame {
    pub fn metrics(&self) -> Value {
        json!({"evalCount":self.eval_count,"evalDurationNs":self.eval_duration,"finishReason":self.done_reason,"totalDurationNs":self.total_duration,"loadDurationNs":self.load_duration,"promptEvalCount":self.prompt_eval_count})
    }
}

#[derive(Default)]
pub struct Ndjson {
    buffer: Vec<u8>,
}

impl Ndjson {
    pub fn push(&mut self, bytes: &[u8]) -> Vec<AppResult<Frame>> {
        self.buffer.extend_from_slice(bytes);
        let mut frames = Vec::new();
        let mut consumed = 0;
        for (index, byte) in self.buffer.iter().enumerate() {
            if *byte == b'\n' {
                let line = &self.buffer[consumed..index];
                if line.len() > 1024 * 1024 {
                    frames.push(Err("模型返回的数据过大，已停止接收。".into()));
                    return frames;
                }
                if !line.iter().all(u8::is_ascii_whitespace) {
                    let frame = parse(line);
                    let failed = frame.is_err();
                    frames.push(frame);
                    if failed {
                        return frames;
                    }
                }
                consumed = index + 1;
            }
        }
        self.buffer.drain(..consumed);
        if self.buffer.len() > 1024 * 1024 {
            frames.push(Err("模型返回的数据过大，已停止接收。".into()));
        }
        frames
    }

    pub fn finish(&mut self) -> Vec<AppResult<Frame>> {
        if self.buffer.iter().all(u8::is_ascii_whitespace) {
            return Vec::new();
        }
        let frame = parse(&self.buffer);
        self.buffer.clear();
        vec![frame]
    }
}

fn parse(line: &[u8]) -> AppResult<Frame> {
    let frame: Frame = serde_json::from_slice(line).map_err(|_| {
        "模型响应格式异常，已保留收到的内容。请重试或检查 Ollama 版本。".to_string()
    })?;
    if frame.error.is_some() {
        return Err("模型服务返回错误，请确认所选模型已安装，或换一个模型后重试。".into());
    }
    if frame
        .message
        .as_ref()
        .is_some_and(|message| !message.role.is_empty() && message.role != "assistant")
    {
        return Err("模型返回了不支持的消息类型。".into());
    }
    Ok(frame)
}

pub fn validate_endpoint(endpoint: &str) -> AppResult<String> {
    let url = Url::parse(endpoint).map_err(|_| "本地模型地址无效。".to_string())?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
    {
        return Err("模型服务只能连接到本机地址（127.0.0.1）。".into());
    }
    Ok(endpoint.trim_end_matches('/').into())
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "本地模型响应超时，已保留收到的内容。可以缩短问题、换小模型或增加超时后重试。".into()
    } else {
        "无法连接本地 Ollama，或连接已中断。请启动 Ollama 后重试；已有内容已保留。".into()
    }
}

async fn small_json(mut response: Response) -> AppResult<Value> {
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if bytes.len() + chunk.len() > 4 * 1024 * 1024 {
            return Err("模型服务的响应过大。".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    serde_json::from_slice(&bytes)
        .map_err(|_| "本地模型服务返回了无效数据，请检查 Ollama 版本。".into())
}

impl Ollama {
    pub fn new() -> AppResult<Self> {
        #[allow(unused_mut)]
        let mut endpoint = "http://127.0.0.1:11434".to_string();
        #[cfg(debug_assertions)]
        if let Ok(value) = std::env::var("CORTEXOS_TEST_OLLAMA_URL") {
            endpoint = value;
        }
        let endpoint = validate_endpoint(&endpoint)?;
        let client = Client::builder()
            .no_proxy()
            .redirect(reqwest::redirect::Policy::none())
            .connect_timeout(Duration::from_secs(3))
            .build()
            .map_err(|_| "无法初始化本地模型连接。".to_string())?;
        Ok(Self { client, endpoint })
    }

    async fn get(&self, path: &str) -> AppResult<Value> {
        let response = self
            .client
            .get(format!("{}{path}", self.endpoint))
            .timeout(Duration::from_secs(5))
            .send()
            .await
            .map_err(network_error)?;
        if !response.status().is_success() {
            return Err("本地 Ollama 接口不可用，请检查服务版本后重试。".into());
        }
        small_json(response).await
    }

    pub async fn health(&self) -> AppResult<ModelHealth> {
        let version = self.get("/api/version").await?;
        let tags = self.get("/api/tags").await?;
        let models = tags["models"]
            .as_array()
            .ok_or("模型列表格式异常，请检查 Ollama 版本。")?;
        let models = models
            .iter()
            .take(1000)
            .map(|model| {
                let name = model["name"].as_str().ok_or("模型名称缺失。")?.to_string();
                if name.len() > 200 {
                    return Err("模型名称过长。".to_string());
                }
                Ok(LocalModel {
                    name,
                    size: model["size"].as_u64().unwrap_or(0),
                    parameter_size: model["details"]["parameter_size"]
                        .as_str()
                        .map(str::to_string),
                    quantization: model["details"]["quantization_level"]
                        .as_str()
                        .map(str::to_string),
                })
            })
            .collect::<AppResult<Vec<_>>>()?;
        Ok(ModelHealth {
            version: version["version"].as_str().unwrap_or("未知").into(),
            models,
        })
    }

    pub async fn inspect(&self, settings: &ModelSettings) -> AppResult<Value> {
        let inspection = self
            .client
            .post(format!("{}/api/show", self.endpoint))
            .timeout(Duration::from_secs(10))
            .json(&json!({"model":settings.model}))
            .send()
            .await
            .map_err(network_error)?;
        if !inspection.status().is_success() {
            return Err("无法检查所选模型，请确认模型已完整下载。".into());
        }
        let inspection = small_json(inspection).await?;
        if inspection["remote_host"]
            .as_str()
            .is_some_and(|value| !value.is_empty())
            || inspection["remote_model"]
                .as_str()
                .is_some_and(|value| !value.is_empty())
            || inspection["details"]["format"].as_str() != Some("gguf")
        {
            return Err("请使用安装在本机的 GGUF 格式模型；云端模型和无法确认来源的模型暂不支持。".into());
        }
        Ok(
            json!({"format":"gguf","model":settings.model,"digest":inspection.get("digest"),"identityNote":"digest unknown when provider omits it"}),
        )
    }
    pub async fn chat(&self, settings: &ModelSettings, request: &Value) -> AppResult<Response> {
        let response = self
            .client
            .post(format!("{}/api/chat", self.endpoint))
            .timeout(Duration::from_secs(settings.timeout_seconds))
            .json(request)
            .send()
            .await
            .map_err(network_error)?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err("所选模型不存在，请在设置中选择已安装模型。".into());
        }
        if !response.status().is_success() {
            return Err("本地模型未能开始生成，请检查模型是否可用或尝试较小模型。".into());
        }
        Ok(response)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parser_handles_split_utf8_multiple_frames_and_truncated_json() {
        let input="{\"message\":{\"role\":\"assistant\",\"content\":\"你好\"},\"done\":false}\n{\"done\":true,\"eval_count\":2}".as_bytes();
        let mut parser = Ndjson::default();
        let mut frames = Vec::new();
        for byte in input {
            frames.extend(parser.push(&[*byte]).into_iter().map(Result::unwrap));
        }
        frames.extend(parser.finish().into_iter().map(Result::unwrap));
        assert_eq!(frames.len(), 2);
        assert_eq!(frames[0].message.as_ref().unwrap().content, "你好");
        assert!(frames[1].done);
        assert_eq!(frames[1].metrics()["evalCount"], 2);
        let mut invalid = Ndjson::default();
        assert!(invalid.push(b"{\"done\":").is_empty());
        assert!(invalid.finish()[0].is_err());
        let mut mixed = Ndjson::default();
        let frames =
            mixed.push(b"{\"message\":{\"role\":\"assistant\",\"content\":\"saved\"}}\n{bad}\n");
        assert_eq!(
            frames[0]
                .as_ref()
                .unwrap()
                .message
                .as_ref()
                .unwrap()
                .content,
            "saved"
        );
        assert!(frames[1].is_err());
        assert!(parse(b"{\"error\":\"untrusted details\"}").is_err());
    }

    #[test]
    fn endpoint_cannot_redirect_or_escape_to_external_hosts() {
        assert!(validate_endpoint("http://127.0.0.1:11434").is_ok());
        for endpoint in [
            "https://127.0.0.1:11434",
            "http://localhost:11434",
            "http://example.com:11434",
            "http://127.0.0.1:11434/proxy",
            "http://user@127.0.0.1:11434",
            "http://127.0.0.1:11434?next=remote",
        ] {
            assert!(validate_endpoint(endpoint).is_err());
        }
    }
}

pub fn chat_request(settings: &ModelSettings, messages: &[ChatMessage]) -> Value {
    json!({"model":settings.model,"messages":messages,"stream":true,"think":false,"keep_alive":"5m",
        "options":{"num_ctx":settings.num_ctx,"temperature":settings.temperature,"num_predict":settings.num_predict}})
}
