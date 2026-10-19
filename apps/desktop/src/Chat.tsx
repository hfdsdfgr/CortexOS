import { useEffect, useRef, useState } from "react";
import { ArrowDown, Pencil } from "lucide-react";
import { navigate, useNavigation } from "./navigation";
import { ChatMessage } from "./components/ChatMessage";
import { ChatComposer } from "./components/ChatComposer";
import { EmptyState } from "./components/EmptyState";
import { CognitiveInspector } from "./components/CognitiveInspector";
import { errorText, type Message, type Studio } from "./studio";

export function ChatPage({
  studio,
  onCreateWorkspace,
  onSaveKnowledge,
}: {
  studio: Studio;
  onCreateWorkspace: () => void;
  onSaveKnowledge: (message: Message, excerpt: string) => void;
}) {
  const route = useNavigation();
  useEffect(() => {
    if (!route.message || studio.loadingMessages) return;
    const element = document.getElementById(`message-${route.message}`);
    element?.scrollIntoView({ block: "center" });
    element?.focus({ preventScroll: true });
  }, [route.message, studio.messages.length, studio.loadingMessages]);
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
    if (!route.message && nearBottom.current && scroller.current)
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

  const send = (content?: string) => {
    navigate("chat", {
      workspace: studio.workspaceId,
      conversation: studio.conversationId,
    });
    return studio.send(content);
  };
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
    } catch {
      studio.reportError("无法自动复制，请选中回答文字后复制。");
    }
  };

  return (
    <div
      className={`chat-layout live-chat-layout ${studio.messages.length ? "has-messages" : "is-empty"}`}
    >
      <section className="chat-main" aria-labelledby="page-title">
        <header className="page-heading">
          <div>
            <h1 id="page-title">对话</h1>
            {conversation && (
              <p className="conversation-title">{conversation.title}</p>
            )}
          </div>
          <div className="heading-actions">
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
                <ChatMessage
                  key={message.id}
                  message={message}
                  located={route.message === message.id}
                  copied={copied}
                  copy={copy}
                  onSaveKnowledge={onSaveKnowledge}
                  setSelectedRun={setSelectedRun}
                  modelReady={modelReady}
                  studio={studio}
                  send={send}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              studio={studio}
              modelReady={modelReady}
              onCreateWorkspace={onCreateWorkspace}
            />
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
        <ChatComposer
          studio={studio}
          modelReady={modelReady}
          currentRunning={currentRunning}
          cancelling={cancelling}
          setCancelling={setCancelling}
          canSend={canSend}
          send={send}
        />
        <p className="sr-only" role="status">
          {currentRunning ? "本地助手正在生成回答" : "当前没有生成任务"}
          {copied ? "，回答已复制" : ""}
        </p>
      </section>
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
      <CognitiveInspector
        runId={selectedRun}
        studio={studio}
        onClose={() => setSelectedRun(null)}
      />
    </div>
  );
}
