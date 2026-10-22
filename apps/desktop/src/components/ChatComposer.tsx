import {
  Box,
  ChevronDown,
  Eye,
  HardDrive,
  Pencil,
  Send,
  Square,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "./MarkdownContent";
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
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const scope = `${studio.workspaceId}:${studio.conversationId}`;
  const preview = previewKey === scope;
  const textarea = useRef<HTMLTextAreaElement>(null);
  const previewArea = useRef<HTMLDivElement>(null);
  const previousPreview = useRef(false);
  useEffect(() => {
    if (previousPreview.current !== preview) {
      (preview ? previewArea.current : textarea.current)?.focus();
      previousPreview.current = preview;
    }
  }, [preview]);
  return (
    <div className="composer-area">
      <div className="composer">
        <label className="sr-only" htmlFor="message">
          你的问题
        </label>
        <textarea
          ref={textarea}
          hidden={preview}
          id="message"
          rows={1}
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
        {preview && (
          <div
            ref={previewArea}
            className="composer-preview markdown-content"
            tabIndex={0}
            role="region"
            aria-label="Markdown 预览"
          >
            {studio.draft ? (
              <MarkdownContent content={studio.draft} />
            ) : (
              <p>输入内容后可预览排版。</p>
            )}
          </div>
        )}
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
          <div className="composer-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={preview ? "返回 Markdown 编辑" : "预览 Markdown"}
              title={preview ? "返回编辑" : "预览 Markdown"}
              aria-pressed={preview}
              disabled={
                !studio.desktop ||
                !studio.workspaceId ||
                studio.sending ||
                studio.loadingMessages
              }
              onClick={() => setPreviewKey(preview ? null : scope)}
            >
              {preview ? (
                <Pencil size={17} aria-hidden="true" />
              ) : (
                <Eye size={17} aria-hidden="true" />
              )}
            </button>
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
                  setPreviewKey(null);
                  void send();
                }}
                aria-label={studio.sending ? "正在发送" : "发送消息"}
              >
                <Send size={19} aria-hidden="true" />
              </button>
            )}
          </div>
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
            {studio.savingRetrieval ? "正在保存…" : "自动查找知识"}
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
          Enter 发送，Shift+Enter 换行。支持 Markdown
          标题、列表、代码和表格，点击眼睛图标预览，返回编辑保留原文。系统会在容量允许的范围内选取最近的完整对话，并查找当前工作区已确认的知识；不会直接搜索文件全文。请结合依据判断回答是否可靠。
        </p>
        {!studio.desktop && <p>浏览器预览不会读取或保存本地数据。</p>}
      </details>
    </div>
  );
}
