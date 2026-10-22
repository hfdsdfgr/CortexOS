import { useEffect, useRef, useState } from "react";
import { MarkdownContent } from "./MarkdownContent";
import { X } from "lucide-react";
import { SourceBrowser, type SourceRef } from "../SourceBrowser";
import { navigate } from "../navigation";
import type {
  CitationOccurrence,
  KnowledgeReference,
  Message,
} from "../studio";

export function AnswerContent({
  message,
  raw = false,
}: {
  message: Message;
  raw?: boolean;
}) {
  const report =
    message.role === "assistant" && message.status !== "streaming"
      ? message.citations
      : null;
  const [selected, setSelected] = useState<CitationOccurrence | null>(null);
  let cursor = 0;
  let compatible = true;
  for (const item of report?.occurrences ?? []) {
    // Keep the original answer if a stale/incompatible report ever reaches the UI.
    if (
      item.start < cursor ||
      message.content.slice(item.start, item.end) !== item.label
    ) {
      compatible = false;
      break;
    }
    cursor = item.end;
  }
  const invalid = report?.occurrences.filter((item) => item.error).length ?? 0;
  return (
    <>
      <div
        className={`message-content ${raw ? "markdown-source" : "markdown-content"}`}
      >
        {raw ? (
          message.content
        ) : (
          <MarkdownContent
            content={message.content}
            occurrences={compatible ? report?.occurrences : []}
            onCitation={setSelected}
          />
        )}
      </div>
      {invalid > 0 && (
        <p className="citation-warning" role="status">
          有 {invalid} 处引用无法定位，点击标记查看原因。
        </p>
      )}
      {report && report.availableCount > 0 && !report.occurrences.length && (
        <p className="citation-warning" role="status">
          这条回答没有标明资料引用。
        </p>
      )}
      {selected && (
        <CitationDetail
          key={`${message.id}:${selected.start}`}
          message={message}
          occurrence={selected}
          reference={report?.references.find(
            (item) => item.citationId === selected.referenceId,
          )}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function CitationDetail({
  message,
  occurrence,
  reference,
  onClose,
}: {
  message: Message;
  occurrence: CitationOccurrence;
  reference?: KnowledgeReference;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const located = useRef<HTMLSpanElement>(null);
  const [source, setSource] = useState<SourceRef | null>(null);
  useEffect(() => {
    dialog.current?.showModal();
    located.current?.scrollIntoView({ block: "center" });
  }, []);
  const start = occurrence.startLine ?? 1;
  const end = occurrence.endLine ?? start;
  return (
    <>
      <dialog
        ref={dialog}
        className="side-drawer citation-drawer"
        aria-labelledby={`citation-${message.id}`}
        onClose={onClose}
      >
        <div className="drawer-heading">
          <h2 id={`citation-${message.id}`}>引用文字</h2>
          <button
            className="icon-button"
            aria-label="关闭引用文字"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        {occurrence.error || !reference ? (
          <p className="form-error" role="alert">
            {occurrence.label}：
            {occurrence.error ?? "没有找到对应的已保存资料。"}
          </p>
        ) : (
          <>
            <h3>{reference.title}</h3>
            <div className="citation-meta">
              {reference.citationId}，知识 v{reference.version}，第 {start}–
              {end} 行
            </div>
            <div className="citation-lines" aria-label="本次发给模型的知识文字">
              {reference.content.split("\n").map((line, index) => (
                <span
                  key={index}
                  className="citation-line"
                  data-selected={
                    (index + 1 >= start && index + 1 <= end) || undefined
                  }
                  ref={index + 1 === start ? located : undefined}
                >
                  <span className="citation-line-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  <span>{line || "\u00a0"}</span>
                </span>
              ))}
            </div>
            <button
              className="button secondary"
              onClick={() => {
                const params = new URLSearchParams({
                  workspace: message.workspaceId,
                  conversation: message.conversationId,
                  message: message.id,
                });
                navigate("knowledge", {
                  workspace: message.workspaceId,
                  node: reference.nodeId,
                  version: reference.version,
                  back: `#/chat?${params}`,
                });
              }}
            >
              查看这个知识版本
            </button>
            {!!reference.sourceEvidence?.length && (
              <details className="citation-origin">
                <summary>这条知识最初选自的文件</summary>
                <p>知识可能经过编辑，请分别核对知识文字与文件原文。</p>
                {reference.sourceEvidence.map((item, index) => (
                  <div key={index}>
                    <p>
                      {item.name}，文件 v{item.version}，第 {item.startLine}–
                      {item.endLine} 行
                    </p>
                    <blockquote>{item.excerpt}</blockquote>
                    <button
                      className="button secondary"
                      onClick={() => setSource(item)}
                    >
                      查看当时的文件文字
                    </button>
                  </div>
                ))}
              </details>
            )}
            <details className="citation-origin">
              <summary>检查范围与保存记录</summary>
              <p>
                这里只检查引用位置是否存在。能找到文字，不代表回答内容已核实。
              </p>
              <p>
                显示的是本次发给模型的版本，不会随之后的修改改变。停止或失败的回答可能不完整。
              </p>
              <p>
                内容校验码（SHA-256）：<code>{reference.contentHash}</code>
              </p>
            </details>
          </>
        )}
      </dialog>
      {source && (
        <SourceBrowser
          workspace={message.workspaceId}
          initial={source}
          onClose={() => setSource(null)}
        />
      )}
    </>
  );
}
