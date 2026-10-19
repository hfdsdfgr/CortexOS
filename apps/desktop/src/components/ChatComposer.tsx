import { Box, ChevronDown, HardDrive, Send, Square } from "lucide-react";
import { ContextPicker } from "../ContextPicker";
import type { Studio } from "../studio";
export function ChatComposer({
  studio,
  modelReady,
  currentRunning,
  cancelling,
  setCancelling,
  canSend,
  send,
}: {
  studio: Studio;
  modelReady: boolean | undefined;
  currentRunning: boolean;
  cancelling: boolean;
  setCancelling: (value: boolean) => void;
  canSend: boolean;
  send: (content?: string) => Promise<void>;
}) {
  return (
    <div className="composer-area">
      <div className="composer">
        <label className="sr-only" htmlFor="message">
          你的问题
        </label>
        <textarea
          id="message"
          rows={2}
          value={studio.draft}
          onChange={(event) => studio.setDraft(event.target.value)}
          placeholder={
            studio.workspaceId ? "输入问题…" : "创建工作区后，在这里输入问题…"
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
              if (canSend) void send();
            }
          }}
        />
        <div className="composer-toolbar">
          <a
            className="composer-model"
            href="#/settings"
            title={modelReady ? "选择或配置本地模型" : "模型尚未就绪，打开设置"}
          >
            <Box size={17} aria-hidden="true" />
            <span>{studio.settings.model}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </a>
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
                void send();
              }}
              aria-label={studio.sending ? "正在发送" : "发送消息"}
            >
              <Send size={19} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      <div className="composer-context">
        {studio.desktop && studio.workspaceId && (
          <label className="retrieval-switch">
            <input
              type="checkbox"
              checked={studio.autoRetrieval}
              disabled={
                studio.savingRetrieval ||
                studio.sending ||
                !!studio.activeRun ||
                studio.loadingMessages ||
                studio.creatingConversation
              }
              onChange={(event) => {
                void studio.setAutoRetrieval(event.target.checked);
              }}
            />
            {studio.savingRetrieval ? "正在保存…" : "自动检索知识"}
          </label>
        )}
        <span className="local-label">
          <HardDrive size={15} aria-hidden="true" />
          本地
        </span>
        <ContextPicker
          key={`${studio.workspaceId}:${studio.conversationId}`}
          studio={studio}
        />
      </div>
      <details className="composer-help">
        <summary>对话说明与快捷键</summary>
        <p>
          Enter 发送，Shift+Enter
          换行。上下文按预算选取最近完整对话，自动检索仅使用当前工作区的已确认知识，尚不检索文件。回答请结合依据判断。
        </p>
        {!studio.desktop && <p>浏览器预览不会读取或保存本地数据。</p>}
      </details>
    </div>
  );
}
