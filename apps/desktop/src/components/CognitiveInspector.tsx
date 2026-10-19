import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { errorText, type RunDetail, type Studio } from "../studio";
const statusNames: Record<string, string> = {
  streaming: "生成中",
  completed: "已完成",
  cancelled: "已停止",
  failed: "生成失败",
  interrupted: "生成中断",
};
const eventNames: Record<string, string> = {
  request_received: "收到问题",
  context_prepared: "准备上下文",
  model_called: "开始本地模型调用尝试（旧记录）",
  model_inspection_started: "开始检查本地模型",
  model_inspection_completed: "本地模型检查完成",
  model_request_started: "开始发送模型请求",
  model_response_received: "收到模型服务响应",
  response_completed: "回答完成",
  run_cancelled: "用户停止生成",
  run_failed: "生成失败",
  run_interrupted: "恢复中断记录",
};

export function CognitiveInspector({
  runId,
  studio,
  onClose,
}: {
  runId: string | null;
  studio: Studio;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completion = detail?.events.find(
    (event) => event.kind === "response_completed",
  )?.payload as { metrics?: { finishReason?: string } } | undefined;
  const outputLimited = completion?.metrics?.finishReason === "length";
  useEffect(() => {
    if (!runId) return;
    let current = true;
    setDetail(null);
    setError(null);
    dialog.current?.showModal();
    const load = () =>
      studio
        .getRun(runId)
        .then((result) => {
          if (current) setDetail(result);
        })
        .catch((value) => {
          if (current) setError(errorText(value));
        });
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, 1000);
    return () => {
      current = false;
      window.clearInterval(timer);
    };
  }, [runId, studio.getRun]);
  return (
    <dialog
      ref={dialog}
      className="side-drawer run-drawer"
      aria-labelledby="run-title"
      onClose={onClose}
    >
      <div className="drawer-heading">
        <h2 id="run-title">本次执行</h2>
        <button
          className="icon-button"
          aria-label="关闭执行详情"
          onClick={() => dialog.current?.close()}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : !detail ? (
        <p role="status">正在读取执行记录…</p>
      ) : (
        <>
          <dl className="run-summary">
            <div>
              <dt>模型</dt>
              <dd>{detail.run.modelId}</dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>
                {outputLimited
                  ? "达到输出上限"
                  : (statusNames[detail.run.status] ??
                    (detail.run.status === "running"
                      ? "生成中"
                      : detail.run.status))}
              </dd>
            </div>
            <div>
              <dt>开始时间</dt>
              <dd>{new Date(detail.run.startedAt).toLocaleString("zh-CN")}</dd>
            </div>
            <div>
              <dt>上下文 / 最大输出</dt>
              <dd>
                {detail.settings.numCtx} / {detail.settings.numPredict}
              </dd>
            </div>
            <div>
              <dt>温度 / 超时</dt>
              <dd>
                {detail.settings.temperature} / {detail.settings.timeoutSeconds}{" "}
                秒
              </dd>
            </div>
          </dl>
          {detail.run.errorMessage && (
            <p className="form-error">{detail.run.errorMessage}</p>
          )}
          <h3>实际执行步骤</h3>
          <ol className="execution-timeline">
            {detail.events.map((event) => (
              <li key={event.seq}>
                <span className="timeline-dot" />
                <div>
                  <strong>{eventNames[event.kind] ?? event.kind}</strong>
                  <span>
                    {new Date(event.occurredAt).toLocaleTimeString("zh-CN")} ·
                    距开始{" "}
                    {Math.max(
                      0,
                      new Date(event.occurredAt).getTime() -
                        new Date(detail.run.startedAt).getTime(),
                    )}{" "}
                    ms
                  </span>
                </div>
              </li>
            ))}
          </ol>
          <h3>使用的上下文</h3>
          {detail.contextManifest.knowledgeRefs?.map((item) => (
            <details key={item.nodeId} className="knowledge-disclosure">
              <summary>
                {item.title} · 本次使用 v{item.version}
              </summary>
              <p className="context-content">{item.content}</p>
              <p>用户选定的参考资料；纳入上下文不代表回答已验证。</p>
              <code>{item.nodeId}</code>
            </details>
          ))}
          {detail.snapshot ? (
            <details className="advanced-settings">
              <summary>完整请求快照</summary>
              <p>本地保存的实际请求；模型仅按标签记录，不保证逐字重现。</p>
              {detail.snapshot.request.messages.map((item, index) => (
                <details key={index}>
                  <summary>
                    {index + 1}. {item.role}
                  </summary>
                  <p className="context-content">{item.content}</p>
                </details>
              ))}
              <p className="identifier">
                SHA-256：{detail.snapshot.requestHash}
              </p>
            </details>
          ) : (
            <p>历史记录未保存完整快照，仅有上下文清单。</p>
          )}
          <p className="muted">
            {detail.contextManifest.messageRefs.length}{" "}
            条会话消息；未使用文件检索。
          </p>
          <p className="small-note">
            预算占用 {detail.contextManifest.estimatedUnits} /{" "}
            {detail.contextManifest.budgetUnits}。
            {detail.contextManifest.estimateNote}。
          </p>
          <details className="advanced-settings">
            <summary>运行标识与消息定位</summary>
            <p className="identifier">{detail.run.id}</p>
            {detail.contextManifest.messageRefs.map((reference) => (
              <p className="identifier" key={reference.messageId}>
                {reference.messageId}
                <br />
                SHA-256：{reference.contentHash}
              </p>
            ))}
          </details>
          <p className="small-note">
            这些记录来自应用实际执行的步骤，不代表模型的内部思维。
          </p>
        </>
      )}
    </dialog>
  );
}
