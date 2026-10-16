import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  GitBranch,
  HardDrive,
  MessageSquare,
  PanelLeft,
  Pencil,
  Plus,
  Square,
  X,
} from "lucide-react";
import { errorText, type RunDetail, type Studio } from "./studio";

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
  model_called: "调用本地模型",
  response_completed: "回答完成",
  run_cancelled: "用户停止生成",
  run_failed: "生成失败",
  run_interrupted: "恢复中断记录",
};

function Conversations({
  studio,
  onSelect,
}: {
  studio: Studio;
  onSelect?: () => void;
}) {
  return (
    <>
      <div className="sidebar-heading">
        <h2>会话</h2>
        <span className="count">{studio.conversations.length}</span>
      </div>
      <button
        className="button secondary new-conversation"
        disabled={
          !studio.desktop ||
          !studio.workspaceId ||
          studio.loading ||
          studio.creatingConversation ||
          studio.sending
        }
        onClick={() => {
          void studio
            .newConversation()
            .then(onSelect)
            .catch(studio.reportError);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        {studio.creatingConversation ? "正在创建…" : "新建对话"}
      </button>
      {studio.conversations.length ? (
        <ul className="conversation-list">
          {studio.conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                className="conversation-item"
                aria-current={
                  conversation.id === studio.conversationId ? "true" : undefined
                }
                title={conversation.title}
                onClick={() => {
                  void studio
                    .openConversation(conversation.workspaceId, conversation.id)
                    .then(onSelect)
                    .catch(studio.reportError);
                }}
              >
                <MessageSquare size={15} aria-hidden="true" />
                <span>{conversation.title}</span>
                {studio.activeRun?.conversationId === conversation.id && (
                  <span className="running-mark" aria-label="生成中" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sidebar-empty">
          <MessageSquare size={22} aria-hidden="true" />
          <p>还没有会话</p>
        </div>
      )}
      <p className="sidebar-footer">
        <HardDrive size={14} aria-hidden="true" />
        {studio.desktop ? "会话自动保存在本机" : "浏览器仅供界面预览"}
      </p>
    </>
  );
}

export function ChatPage({
  studio,
  onCreateWorkspace,
}: {
  studio: Studio;
  onCreateWorkspace: () => void;
}) {
  const conversation = studio.conversations.find(
    (item) => item.id === studio.conversationId,
  );
  const currentRunning =
    studio.activeRun?.conversationId === studio.conversationId;
  const modelReady = studio.health?.models.some(
    (model) => model.name === studio.settings.model,
  );
  const canSend =
    studio.desktop &&
    !!studio.workspaceId &&
    !!modelReady &&
    !!studio.draft.trim() &&
    !studio.activeRun &&
    !studio.sending &&
    !studio.loadingMessages;
  const scroller = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  const renameDialog = useRef<HTMLDialogElement>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [selectedRun, setSelectedRun] = useState<string | null>(null);

  useEffect(() => {
    nearBottom.current = true;
    setShowJump(false);
  }, [studio.conversationId]);
  useEffect(() => {
    if (nearBottom.current && scroller.current)
      scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [studio.messages]);
  useEffect(() => {
    if (!currentRunning) setCancelling(false);
  }, [currentRunning]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      studio.reportError("无法自动复制，请选中回答文字后复制。");
    }
  };

  return (
    <div className="chat-layout live-chat-layout">
      <aside className="conversation-sidebar" aria-label="会话列表">
        <Conversations studio={studio} />
      </aside>
      <section className="chat-main" aria-labelledby="page-title">
        <header className="page-heading">
          <div>
            <h1 id="page-title">对话</h1>
            {conversation && <p className="conversation-title">{conversation.title}</p>}
          </div>
          <div className="heading-actions">
            <button
              className="button text-button mobile-conversation-button"
              aria-label="打开会话列表"
              onClick={() => drawer.current?.showModal()}
            >
              <PanelLeft size={18} aria-hidden="true" />
              会话
            </button>
            {conversation && (
              <button
                className="icon-button"
                aria-label="重命名会话"
                onClick={() => {
                  setRenameTitle(conversation.title);
                  setRenameError(null);
                  renameDialog.current?.showModal();
                }}
              >
                <Pencil size={17} aria-hidden="true" />
              </button>
            )}
          </div>
        </header>
        {studio.activeRun && !currentRunning && (
          <div className="active-run-notice" role="status">
            另一个会话正在生成回答。
            <button
              className="button text-button"
              onClick={() => {
                const run = studio.activeRun!;
                void studio
                  .openWorkspace(run.workspaceId)
                  .then(() =>
                    studio.openConversation(
                      run.workspaceId,
                      run.conversationId,
                    ),
                  )
                  .catch(studio.reportError);
              }}
            >
              前往生成中的会话
            </button>
          </div>
        )}
        <div
          className="message-scroll"
          ref={scroller}
          onScroll={() => {
            const element = scroller.current!;
            nearBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight <
              80;
            setShowJump(!nearBottom.current);
          }}
        >
          {studio.loadingMessages ? (
            <p className="inline-loading" role="status">
              正在读取会话…
            </p>
          ) : studio.messages.length ? (
            <div className="messages">
              {studio.messages.map((message) => (
                <article
                  className={`message ${message.role}`}
                  key={message.id}
                  aria-label={message.role === "user" ? "你的问题" : "模型回答"}
                >
                  <div className="message-heading">
                    <strong>
                      {message.role === "user" ? "你" : "本地助手"}
                    </strong>
                    {message.role === "assistant" && (
                      <span
                        className={`message-status ${message.finishReason === "length" ? "limited" : message.status}`}
                      >
                        {message.finishReason === "length"
                          ? "达到输出上限"
                          : (statusNames[message.status] ?? message.status)}
                      </span>
                    )}
                  </div>
                  <div className="message-content">
                    {message.content ||
                      (message.status === "streaming"
                        ? "正在准备回答…"
                        : "本次未生成可用文字。")}
                  </div>
                  {message.role === "assistant" &&
                    message.finishReason === "length" && (
                      <p className="output-limit-note">
                        已达到输出上限，回答可能未完整。可在设置中增加“最大输出”后重试。
                      </p>
                    )}
                  {message.role === "assistant" && (
                    <div className="message-actions">
                      <button
                        className="button text-button"
                        disabled={!message.content}
                        onClick={() => {
                          void copy(message.id, message.content);
                        }}
                      >
                        {copied === message.id ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )}
                        {copied === message.id ? "已复制" : "复制"}
                      </button>
                      {message.modelRunId && (
                        <button
                          className="button text-button"
                          onClick={() => setSelectedRun(message.modelRunId)}
                        >
                          <GitBranch size={14} aria-hidden="true" />
                          执行过程
                        </button>
                      )}
                      {(["failed", "cancelled", "interrupted"].includes(
                        message.status,
                      ) ||
                        message.finishReason === "length") && (
                        <button
                          className="button text-button"
                          disabled={
                            !modelReady || !!studio.activeRun || studio.sending
                          }
                          onClick={() => {
                            const question = studio.messages.find(
                              (item) =>
                                item.role === "user" &&
                                item.modelRunId === message.modelRunId,
                            );
                            if (question) void studio.send(question.content);
                          }}
                        >
                          重试
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className="chat-empty">
              <div className="empty-symbol">
                <MessageSquare size={30} strokeWidth={1.5} aria-hidden="true" />
              </div>
              <h2>
                {!studio.desktop
                  ? "在桌面程序中开始"
                  : !studio.workspaceId
                    ? "给项目一个独立的工作区"
                    : !modelReady
                      ? "连接本地模型，开始讨论"
                      : "从一个问题开始"}
              </h2>
              <p>
                {!studio.desktop
                  ? "打开桌面程序，创建工作区并开始对话。"
                  : !studio.workspaceId
                    ? "创建工作区，集中保存这个项目的讨论。"
                    : !modelReady
                      ? "在设置中检测 Ollama，选择已安装模型。"
                      : "梳理想法、拆解问题，继续推进你的项目。"}
              </p>
              {studio.desktop && !studio.workspaceId ? (
                <button
                  className="button primary"
                  disabled={!studio.data || studio.loading}
                  onClick={onCreateWorkspace}
                >
                  <Plus size={16} aria-hidden="true" />
                  创建工作区
                </button>
              ) : (
                !modelReady && (
                  <a className="button primary" href="#/settings">
                    查看模型设置
                  </a>
                )
              )}
            </div>
          )}
        </div>
        {showJump && (
          <button
            className="jump-latest button secondary"
            onClick={() => {
              nearBottom.current = true;
              scroller.current?.scrollTo({
                top: scroller.current.scrollHeight,
              });
              setShowJump(false);
            }}
          >
            <ArrowDown size={15} aria-hidden="true" />
            回到最新内容
          </button>
        )}
        <div className="composer-area">
          <div className="composer">
            <label className="sr-only" htmlFor="message">你的问题</label>
            <textarea
              id="message"
              rows={2}
              value={studio.draft}
              onChange={(event) => studio.setDraft(event.target.value)}
              placeholder={
                studio.workspaceId
                  ? "输入问题…"
                  : "创建工作区后，在这里输入问题…"
              }
              disabled={
                !studio.desktop ||
                !studio.workspaceId ||
                studio.sending ||
                studio.creatingConversation ||
                studio.loadingMessages
              }
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  if (canSend) void studio.send();
                }
              }}
            />
            <div className="composer-toolbar">
              <span>
                {studio.settings.model}
                {!modelReady && " · 尚未就绪"}
              </span>
              {currentRunning ? (
                <button
                  className="button secondary stop-button"
                  disabled={cancelling}
                  onClick={() => {
                    setCancelling(true);
                    void studio.cancel().catch((value) => {
                      setCancelling(false);
                      studio.reportError(value);
                    });
                  }}
                >
                  <Square size={13} aria-hidden="true" />
                  {cancelling ? "正在停止…" : "停止生成"}
                </button>
              ) : (
                <button
                  className="send-button"
                  disabled={!canSend}
                  onClick={() => {
                    void studio.send();
                  }}
                  aria-label={studio.sending ? "正在发送" : "发送消息"}
                >
                  <ArrowUp size={19} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
          <details className="composer-help">
            <summary>对话说明与快捷键</summary>
            <p>Enter 发送，Shift+Enter 换行。上下文按预算选取最近完整对话，当前不使用文件检索。回答请结合依据判断。</p>
            {!studio.desktop && <p>浏览器预览不会读取或保存本地数据。</p>}
          </details>
        </div>
        <p className="sr-only" role="status">
          {currentRunning ? "本地助手正在生成回答" : "当前没有生成任务"}
          {copied ? "，回答已复制" : ""}
        </p>
      </section>
      <dialog className="side-drawer" ref={drawer} aria-label="会话列表">
        <div className="drawer-close">
          <button
            className="icon-button"
            aria-label="关闭会话列表"
            onClick={() => drawer.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <Conversations
          studio={studio}
          onSelect={() => drawer.current?.close()}
        />
      </dialog>
      <dialog
        className="form-dialog"
        ref={renameDialog}
        aria-labelledby="rename-title"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setRenaming(true);
            setRenameError(null);
            void studio
              .renameConversation(renameTitle)
              .then(() => renameDialog.current?.close())
              .catch((value) => setRenameError(errorText(value)))
              .finally(() => setRenaming(false));
          }}
        >
          <h2 id="rename-title">重命名会话</h2>
          <div className="field">
            <label htmlFor="conversation-title">会话名称</label>
            <input
              id="conversation-title"
              value={renameTitle}
              onChange={(event) => setRenameTitle(event.target.value)}
              required
              maxLength={80}
            />
          </div>
          {renameError && (
            <p className="form-error" role="alert">
              {renameError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button secondary"
              type="button"
              onClick={() => renameDialog.current?.close()}
            >
              取消
            </button>
            <button className="button primary" disabled={renaming}>
              {renaming ? "正在保存…" : "保存名称"}
            </button>
          </div>
        </form>
      </dialog>
      <RunInspector
        runId={selectedRun}
        studio={studio}
        onClose={() => setSelectedRun(null)}
      />
    </div>
  );
}

function RunInspector({
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
