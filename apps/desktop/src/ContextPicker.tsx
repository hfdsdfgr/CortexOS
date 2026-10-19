import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { errorText, type ContextManifest, type Studio } from "./studio";
import { RetrievalSummary } from "./components/RetrievalSummary";
import type { KnowledgeNode, KnowledgeDetail } from "./Knowledge";

export function ContextPicker({ studio }: { studio: Studio }) {
  const previewGeneration = useRef(0);
  const [items, setItems] = useState<KnowledgeNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ContextManifest | null>(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let current = true;
    if (!studio.workspaceId || !studio.desktop) return;
    setError(null);
    void invoke<KnowledgeNode[]>("list_knowledge", {
      workspaceId: studio.workspaceId,
    })
      .then(async (data) => {
        const effective = await Promise.all(
          data
            .filter((item) => item.effectiveVersion !== null)
            .map(async (item) => {
              const detail = await invoke<KnowledgeDetail>("get_knowledge", {
                workspaceId: studio.workspaceId,
                nodeId: item.id,
              });
              const version = detail.versions.find(
                (v) => v.version === detail.node.effectiveVersion,
              )!;
              return {
                ...detail.node,
                title: version.title,
                kind: version.kind,
              };
            }),
        );
        if (current)
          setItems(
            effective.filter((item) =>
              ["knowledge", "context", "decision"].includes(item.kind),
            ),
          );
      })
      .catch((value) => {
        if (current) setError(errorText(value));
      });
    return () => {
      current = false;
    };
  }, [studio.workspaceId, studio.desktop, revision]);
  useEffect(() => {
    previewGeneration.current++;
    setPreview(null);
  }, [
    studio.draft,
    studio.contextSelection,
    studio.settings,
    studio.autoRetrieval,
  ]);
  if (!studio.desktop || !studio.workspaceId) return null;
  return (
    <details className="context-picker">
      <summary>手动选择：{studio.contextSelection.length} 项知识</summary>
      <div className="context-toolbar">
        <span>选择已确认的知识、上下文或决策。每次发送固定所选生效版本。</span>
        <button
          type="button"
          className="button text-button"
          onClick={() => setRevision((x) => x + 1)}
        >
          刷新知识列表
        </button>
      </div>
      {items.length === 0 && <p>尚无已确认知识。可先在知识页保存并确认。</p>}
      <div className="context-options">
        {items.map((item) => {
          const selected = studio.contextSelection.find(
            (x) => x.nodeId === item.id,
          );
          return (
            <label key={item.id}>
              <input
                type="checkbox"
                checked={!!selected}
                disabled={busy || studio.sending}
                onChange={(event) => {
                  studio.setContextSelection(
                    event.target.checked
                      ? [
                          ...studio.contextSelection,
                          { nodeId: item.id, version: item.effectiveVersion! },
                        ]
                      : studio.contextSelection.filter(
                          (x) => x.nodeId !== item.id,
                        ),
                  );
                }}
              />
              <span>
                {item.title} <strong>生效 v{item.effectiveVersion}</strong>
                {item.latestVersion !== item.effectiveVersion && " · 有新草案"}
                {selected &&
                  selected.version !== item.effectiveVersion &&
                  " · 所选版本已变化，请取消后重新选择"}
              </span>
            </label>
          );
        })}
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={busy || !studio.draft.trim() || studio.savingRetrieval}
        onClick={() => {
          setBusy(true);
          setError(null);
          const generation = ++previewGeneration.current;
          void invoke<ContextManifest>("preview_context", {
            workspaceId: studio.workspaceId,
            conversationId: studio.conversationId,
            content: studio.draft,
            contextSelection: studio.contextSelection,
          })
            .then((value) => {
              if (generation === previewGeneration.current) setPreview(value);
            })
            .catch((value) => {
              if (generation === previewGeneration.current)
                setError(errorText(value));
            })
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "正在准备…" : "预览上下文"}
      </button>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {preview && (
        <div>
          <p>
            预算 {preview.estimatedUnits} / {preview.budgetUnits}（UTF-8
            字节估算）；{preview.messageRefs.length} 条会话消息。
          </p>
          <RetrievalSummary report={preview.retrieval} />
          {preview.knowledgeRefs?.map((item) => (
            <details key={item.nodeId}>
              <summary>
                {item.title} · v{item.version}
              </summary>
              <p className="context-content">{item.content}</p>
            </details>
          ))}
        </div>
      )}
    </details>
  );
}
