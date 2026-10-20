import { BookOpen, Check, Copy, GitBranch } from "lucide-react";
import { navigate } from "../navigation";
import type { Message, Studio } from "../studio";
import { AnswerContent } from "./AnswerContent";
const statusNames: Record<string, string> = {
  streaming: "生成中",
  completed: "已完成",
  cancelled: "已停止",
  failed: "生成失败",
  interrupted: "生成中断",
};
export function ChatMessage({
  message,
  located,
  copied,
  copy,
  onSaveKnowledge,
  setSelectedRun,
  modelReady,
  studio,
  send,
}: {
  message: Message;
  located: boolean;
  copied: string | null;
  copy: (id: string, text: string) => Promise<void>;
  onSaveKnowledge: (message: Message, excerpt: string) => void;
  setSelectedRun: (id: string | null) => void;
  modelReady: boolean | undefined;
  studio: Studio;
  send: (content?: string) => Promise<void>;
}) {
  return (
    <article
      className={`message ${message.role}`}
      id={`message-${message.id}`}
      tabIndex={-1}
      data-located={located || undefined}
      aria-label={message.role === "user" ? "你的问题" : "模型回答"}
    >
      <div className="message-heading">
        <strong>{message.role === "user" ? "你" : "本地助手"}</strong>
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
      {message.content ? (
        <AnswerContent message={message} />
      ) : (
        <div className="message-content">
          {message.status === "streaming"
            ? "正在准备回答…"
            : "本次未生成可用文字。"}
        </div>
      )}
      {message.role === "assistant" && message.finishReason === "length" && (
        <p className="output-limit-note">
          已达到长度上限，回答可能不完整。可在设置中增加“回答长度上限（Token）”后重试。
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
          <button
            className="button text-button"
            disabled={!message.content || message.status === "streaming"}
            onClick={(event) => {
              const selection = window.getSelection();
              const article = event.currentTarget.closest("article");
              const selected = selection?.toString() ?? "";
              const inside =
                selection?.anchorNode &&
                selection?.focusNode &&
                article
                  ?.querySelector(".message-content")
                  ?.contains(selection.anchorNode) &&
                article
                  ?.querySelector(".message-content")
                  ?.contains(selection.focusNode);
              onSaveKnowledge(
                message,
                Array.from(
                  inside && selected && message.content.includes(selected)
                    ? selected
                    : message.content,
                )
                  .slice(0, 20000)
                  .join(""),
              );
            }}
          >
            <BookOpen size={14} aria-hidden="true" />
            保存为知识
          </button>
          {message.modelRunId && (
            <>
              <button
                className="button text-button"
                onClick={() => setSelectedRun(message.modelRunId)}
              >
                <GitBranch size={14} aria-hidden="true" />
                执行过程
              </button>
              <button
                className="button text-button"
                onClick={() =>
                  navigate("graph", {
                    workspace: message.workspaceId,
                    mode: "execution",
                    run: message.modelRunId,
                  })
                }
              >
                3D 执行轨迹
              </button>
            </>
          )}
          {(["failed", "cancelled", "interrupted"].includes(message.status) ||
            message.finishReason === "length") && (
            <button
              className="button text-button"
              disabled={!modelReady || !!studio.activeRun || studio.sending}
              onClick={() => {
                const question = studio.messages.find(
                  (item) =>
                    item.role === "user" &&
                    item.modelRunId === message.modelRunId,
                );
                if (question) void send(question.content);
              }}
            >
              重试
            </button>
          )}
        </div>
      )}
    </article>
  );
}
