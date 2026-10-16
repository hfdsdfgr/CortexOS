import { useState } from "react";
import {
  CheckCircle2,
  Database,
  Info,
  SlidersHorizontal,
  Unplug,
} from "lucide-react";
import { errorText, type Studio } from "./studio";

export function SettingsPage({ studio }: { studio: Studio }) {
  const draft = studio.settingsDraft;
  const setDraft = studio.setSettingsDraft;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const installed = studio.health?.models.some(
    (model) => model.name === draft.model,
  );
  const changed = JSON.stringify(draft) !== JSON.stringify(studio.settings);
  const field = (
    name: "numCtx" | "numPredict" | "temperature" | "timeoutSeconds",
    value: string,
  ) => {
    setDraft((current) => ({ ...current, [name]: Number(value) }));
    setSaved(false);
  };
  return (
    <section className="standard-page" aria-labelledby="page-title">
      <header className="page-heading">
        <div>
          <h1 id="page-title">设置</h1>
        </div>
      </header>
      <div className="page-content settings-content">
        <section className="settings-section" aria-labelledby="model-settings">
          <div className="section-description">
            <h2 id="model-settings">
              <SlidersHorizontal size={18} aria-hidden="true" />
              模型连接
            </h2>
          </div>
          <form
            className="settings-fields"
            onSubmit={(event) => {
              event.preventDefault();
              setSaving(true);
              setSaved(false);
              setError(null);
              void studio
                .saveSettings(draft)
                .then(() => setSaved(true))
                .catch((value) => setError(errorText(value)))
                .finally(() => setSaving(false));
            }}
          >
            <div
              className={`connection-status ${studio.health ? "connected" : ""}`}
            >
              {studio.health ? (
                <CheckCircle2 size={18} aria-hidden="true" />
              ) : (
                <Unplug size={18} aria-hidden="true" />
              )}
              <div>
                <strong>
                  {!studio.desktop
                    ? "浏览器仅供界面预览"
                    : studio.checking
                      ? "正在检测本地服务…"
                      : studio.health
                        ? `Ollama ${studio.health.version} 已连接`
                        : "未连接本地 Ollama"}
                </strong>
                <p>
                  {studio.health
                    ? studio.health.models.length
                      ? `找到 ${studio.health.models.length} 个本地模型。`
                      : "服务可用，尚未安装模型。"
                    : "打开桌面程序后，检测本机服务与已安装模型。"}
                </p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="endpoint">服务地址</label>
              <input
                id="endpoint"
                value="http://127.0.0.1:11434"
                readOnly
              />
            </div>
            <button
              type="button"
              className="button secondary"
              disabled={!studio.desktop || studio.checking}
              aria-busy={studio.checking}
              onClick={() => {
                void studio.checkConnection();
              }}
            >
              {studio.checking ? "正在检测…" : "检测连接"}
            </button>
            {studio.connectionError && (
              <p className="form-error" role="alert">
                {studio.connectionError}
              </p>
            )}
            {studio.desktop &&
              (!studio.health || !studio.health.models.length) && (
                <div className="setup-instructions">
                  <h3>准备本地模型</h3>
                  <p>安装并启动 Ollama 后，在终端下载模型：</p>
                  <code>ollama pull qwen3:4b-instruct</code>
                  <p>
                    下载完成后，点击“检测连接”。模型下载需要联网，对话在本机运行。
                  </p>
                </div>
              )}
            <div className="field model-field">
              <label htmlFor="model">模型</label>
              <select
                id="model"
                value={draft.model}
                disabled={!studio.desktop || !studio.health?.models.length}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    model: event.target.value,
                  }));
                  setSaved(false);
                }}
              >
                {!installed && (
                  <option value={draft.model}>{draft.model}（未安装）</option>
                )}
                {studio.health?.models.map((model) => (
                  <option key={model.name} value={model.name}>
                    {model.name} · {model.quantization ?? "量化未知"} ·{" "}
                    {(model.size / 1e9).toFixed(1)} GB
                  </option>
                ))}
              </select>
              <details className="field-help">
                <summary>如何选择模型</summary>
                <p>建议 qwen3:4b-instruct。Thinking 模型可能需要更高的最大输出。更改在下一次回答生效。</p>
              </details>
            </div>
            <details className="advanced-settings">
              <summary>生成参数</summary>
              <div className="parameter-fields">
                <div className="field">
                  <label htmlFor="num-ctx">上下文长度</label>
                  <input
                    id="num-ctx"
                    type="number"
                    min={1024}
                    max={16384}
                    step={1}
                    required
                    value={draft.numCtx}
                    readOnly={!studio.desktop}
                    onChange={(event) => field("numCtx", event.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="num-predict">最大输出</label>
                  <input
                    id="num-predict"
                    type="number"
                    min={32}
                    max={2048}
                    step={1}
                    required
                    value={draft.numPredict}
                    readOnly={!studio.desktop}
                    onChange={(event) =>
                      field("numPredict", event.target.value)
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="temperature">温度</label>
                  <input
                    id="temperature"
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    required
                    value={draft.temperature}
                    readOnly={!studio.desktop}
                    onChange={(event) =>
                      field("temperature", event.target.value)
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="timeout">生成超时（秒）</label>
                  <input
                    id="timeout"
                    type="number"
                    min={30}
                    max={600}
                    step={1}
                    required
                    value={draft.timeoutSeconds}
                    readOnly={!studio.desktop}
                    onChange={(event) =>
                      field("timeoutSeconds", event.target.value)
                    }
                  />
                </div>
              </div>
              <p>
                默认单任务生成、模型保留 5
                分钟。上下文需要为输出留出空间；较长上下文会增加显存占用。
              </p>
            </details>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="settings-save">
              <button
                className="button primary"
                disabled={!studio.desktop || saving || !changed}
              >
                {saving ? "正在保存…" : "保存设置"}
              </button>
              <span className="inline-help" role="status">
                {saved
                  ? "设置已保存"
                  : changed
                    ? "有未保存的更改"
                    : ""}
              </span>
            </div>
          </form>
        </section>
        <section className="settings-section" aria-labelledby="data-settings">
          <div className="section-description">
            <h2 id="data-settings">
              <Database size={18} aria-hidden="true" />
              本地数据
            </h2>
          </div>
          <div className="settings-fields">
            <dl className="data-summary">
              <div>
                <dt>工作区与会话保存</dt>
                <dd>
                  {studio.desktop && studio.data
                    ? "自动保存至 SQLite"
                    : "桌面程序中可用"}
                </dd>
              </div>
              <div>
                <dt>文件访问</dt>
                <dd>尚未授权任何来源</dd>
              </div>
              <div>
                <dt>备份与导出</dt>
                <dd>后续版本提供</dd>
              </div>
            </dl>
            {studio.data?.dataPath && (
              <p className="data-path">
                <strong>数据位置</strong>
                <br />
                {studio.data.dataPath}
              </p>
            )}
            <details className="field-help">
              <summary>隐私与存储说明</summary>
              <p>模型请求只发往本机。文件导入开放前，不会读取项目资料。会话保存在本机数据库中。</p>
            </details>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="about-settings">
          <div className="section-description">
            <h2 id="about-settings">
              <Info size={18} aria-hidden="true" />
              关于
            </h2>
          </div>
          <div className="settings-fields">
            <div className="about-line">
              <strong>CortexOS</strong>
              <span className="version-label">0.1.0 · 本地对话 Alpha</span>
            </div>
            <p className="muted">
              知识草案、版本记录与 3D 知识图谱已开放。
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}
