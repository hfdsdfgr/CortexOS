import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { FileText, Plus, X } from "lucide-react";
import { errorText } from "./studio";
import type { EditKnowledge } from "./Knowledge";
export interface SourceRef {
  sourceId: string;
  version: number;
  startLine: number;
  endLine: number;
}
export interface SourceEvidence extends SourceRef {
  name: string;
  enabled: boolean;
  excerpt: string;
  contentHash: string;
  knowledgeVersion: number;
}
interface SourceDocument {
  id: string;
  name: string;
  latestVersion: number;
  enabled: boolean;
  revision: number;
}
interface Snapshot {
  document: SourceDocument;
  version: number;
  content: string;
  contentHash: string;
  createdAt: string;
}
interface Preview {
  ticket: string;
  name: string;
  content: string;
  contentHash: string;
  previousVersion: number | null;
}
export function SourceBrowser({
  workspace,
  initial,
  onClose,
  onDraft,
}: {
  workspace: string;
  initial?: SourceRef;
  onClose: () => void;
  onDraft: (request: EditKnowledge) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const revoke = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<SourceDocument[]>([]);
  const [selected, setSelected] = useState<Snapshot | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [linePage, setLinePage] = useState(0);
  const [start, setStart] = useState(initial?.startLine ?? 1);
  const [end, setEnd] = useState(initial?.endLine ?? 1);
  const live = useRef(true);
  const generation = useRef(0);
  const read = async (id: string, version: number, range?: SourceRef) => {
    const task = ++generation.current;
    setError(null);
    setLoading(true);
    try {
      const next = await invoke<Snapshot>("get_source", {
        workspaceId: workspace,
        sourceId: id,
        version,
      });
      if (live.current && task === generation.current) {
        setSelected(next);
        setLinePage(Math.floor(((range?.startLine ?? 1) - 1) / 200) * 200);
        setStart(range?.startLine ?? 1);
        setEnd(range?.endLine ?? Math.min(10, next.content.split("\n").length));
      }
    } catch (value) {
      if (live.current && task === generation.current)
        setError(errorText(value));
    } finally {
      if (live.current && task === generation.current) setLoading(false);
    }
  };
  const refresh = async () => {
    const list = await invoke<SourceDocument[]>("list_sources", {
      workspaceId: workspace,
    });
    if (live.current) setItems(list);
    return list;
  };
  useEffect(() => {
    dialog.current?.showModal();
    live.current = true;
    void refresh()
      .then(() =>
        initial
          ? read(initial.sourceId, initial.version, initial)
          : setLoading(false),
      )
      .catch((value) => {
        if (live.current) {
          setError(errorText(value));
          setLoading(false);
        }
      });
    return () => {
      live.current = false;
      generation.current++;
    };
  }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (value) {
      if (live.current) setError(errorText(value));
    } finally {
      if (live.current) setBusy(false);
    }
  };
  const cancelPreview = async () => {
    if (preview)
      await invoke("discard_source", {
        workspaceId: workspace,
        ticket: preview.ticket,
      });
    if (live.current) setPreview(null);
  };
  const close = () => {
    if (!busy)
      void perform(async () => {
        await cancelPreview();
        onClose();
      });
  };
  const lines = selected?.content.split("\n") ?? [];
  const valid =
    !!selected &&
    Number.isInteger(start) &&
    Number.isInteger(end) &&
    start >= 1 &&
    end >= start &&
    end <= lines.length;
  const excerpt = valid ? lines.slice(start - 1, end).join("\n") : "";
  return (
    <>
      <dialog
        ref={dialog}
        className="source-browser form-dialog"
        aria-labelledby="sources-title"
        onCancel={(event) => {
          event.preventDefault();
          if (!busy) close();
        }}
      >
        <header className="source-toolbar">
          <h2 id="sources-title">文件来源</h2>
          <div className="source-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  const next = await invoke<Preview | null>("choose_source", {
                    workspaceId: workspace,
                  });
                  if (live.current) setPreview(next);
                })
              }
            >
              <Plus size={16} />
              {busy ? "正在处理…" : "选择文件"}
            </button>
            <button
              className="icon-button"
              aria-label="关闭文件来源"
              disabled={busy}
              onClick={close}
            >
              <X size={20} />
            </button>
          </div>
        </header>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        {preview ? (
          <section className="source-preview">
            <h3>{preview.name}</h3>
            <p>
              {preview.previousVersion
                ? `已保存 v${preview.previousVersion}，确认后保存更新；停用来源将重新启用。`
                : "将保存本地快照，原文件保持不变。"}
            </p>
            <pre className="source-text">{preview.content}</pre>
            <details>
              <summary>导入范围与快照</summary>
              <p>
                仅此文件的 UTF-8 文本，不读取目录。上限2
                MiB。导入后可从指定行建立待审核草案，原文件变化时需重新选择。
              </p>
              <code className="source-hash">SHA-256 {preview.contentHash}</code>
            </details>
            <footer className="dialog-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void perform(cancelPreview)}
              >
                取消导入
              </button>
              <button
                className="button primary"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    const saved = await invoke<SourceDocument>(
                      "commit_source",
                      { workspaceId: workspace, ticket: preview.ticket },
                    );
                    if (!live.current) return;
                    setPreview(null);
                    await refresh();
                    await read(saved.id, saved.latestVersion);
                  })
                }
              >
                确认导入
              </button>
            </footer>
          </section>
        ) : (
          <div className="source-workbench">
            <aside className="source-list" aria-label="已导入来源">
              {items.map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  className="source-row"
                  aria-current={
                    selected?.document.id === item.id ? "true" : undefined
                  }
                  onClick={() => void read(item.id, item.latestVersion)}
                >
                  <FileText size={16} />
                  <span>
                    {item.name}
                    <span>
                      v{item.latestVersion}
                      {item.enabled ? "" : " · 已停用"}
                    </span>
                  </span>
                </button>
              ))}
              {!items.length && !loading && (
                <p>还没有来源，选择 TXT 或 Markdown 文件开始。</p>
              )}
            </aside>
            <section className="source-reader" aria-label="来源原文">
              {loading ? (
                <p role="status">正在读取来源…</p>
              ) : selected ? (
                <>
                  <header className="source-toolbar">
                    <h3>
                      {selected.document.name}
                      {!selected.document.enabled && " · 已停用"}
                    </h3>
                    <label>
                      来源版本
                      <select
                        aria-label="来源版本"
                        disabled={busy}
                        value={selected.version}
                        onChange={(event) =>
                          void read(
                            selected.document.id,
                            Number(event.target.value),
                          )
                        }
                      >
                        {Array.from(
                          { length: selected.document.latestVersion },
                          (_, i) => i + 1,
                        )
                          .reverse()
                          .map((version) => (
                            <option key={version} value={version}>
                              v{version}
                            </option>
                          ))}
                      </select>
                    </label>
                  </header>
                  <div className="source-line-inputs">
                    <label>
                      起始行
                      <input
                        type="number"
                        aria-label="起始行"
                        min={1}
                        max={lines.length}
                        value={start}
                        onChange={(event) => {
                          setStart(Number(event.target.value));
                          setLinePage(
                            Math.max(
                              0,
                              Math.floor(
                                (Number(event.target.value) - 1) / 200,
                              ) * 200,
                            ),
                          );
                        }}
                      />
                    </label>
                    <label>
                      结束行
                      <input
                        type="number"
                        aria-label="结束行"
                        min={start}
                        max={lines.length}
                        value={end}
                        onChange={(event) => setEnd(Number(event.target.value))}
                      />
                    </label>
                    <button
                      className="button primary"
                      disabled={
                        busy ||
                        !selected.document.enabled ||
                        !excerpt.trim() ||
                        [...excerpt].length > 20000
                      }
                      onClick={() => {
                        onDraft({
                          workspaceId: workspace,
                          sourceDocument: {
                            sourceId: selected.document.id,
                            version: selected.version,
                            startLine: start,
                            endLine: end,
                          },
                          sourceName: selected.document.name,
                          excerpt,
                        });
                      }}
                    >
                      从所选行建立草案
                    </button>
                  </div>
                  {!valid && (
                    <p role="alert" className="form-error">
                      请选择有效起止行。
                    </p>
                  )}
                  <div className="source-actions">
                    <button
                      className="button secondary"
                      disabled={linePage === 0}
                      onClick={() => setLinePage(Math.max(0, linePage - 200))}
                    >
                      上一段
                    </button>
                    <span>
                      第 {linePage + 1}–{Math.min(linePage + 200, lines.length)}{" "}
                      行 / 共 {lines.length} 行
                    </span>
                    <button
                      className="button secondary"
                      disabled={linePage + 200 >= lines.length}
                      onClick={() => setLinePage(linePage + 200)}
                    >
                      下一段
                    </button>
                  </div>
                  <pre className="source-text numbered-source">
                    {lines
                      .slice(linePage, linePage + 200)
                      .map((line, index) => {
                        const i = index + linePage;
                        return (
                          <span
                            key={i}
                            className={
                              valid && i + 1 >= start && i + 1 <= end
                                ? "selected-source-line"
                                : ""
                            }
                          >
                            <span
                              aria-hidden="true"
                              className="source-line-number"
                            >
                              {i + 1}
                            </span>
                            {line || " "}
                          </span>
                        );
                      })}
                  </pre>
                  <details>
                    <summary>来源快照与权限</summary>
                    <p>
                      保存于{" "}
                      {new Date(selected.createdAt).toLocaleString("zh-CN")}
                      。文件更新不会改写此快照。停用来源会阻止关联知识进入未来上下文；既有会话和历史证据仍保留。
                    </p>
                    <code className="source-hash">
                      SHA-256 {selected.contentHash}
                    </code>
                    {selected.document.enabled && (
                      <button
                        className="button secondary"
                        disabled={busy}
                        onClick={() => revoke.current?.showModal()}
                      >
                        停用来源
                      </button>
                    )}
                  </details>
                </>
              ) : (
                <p>选择来源查看原文和版本。</p>
              )}
            </section>
          </div>
        )}
      </dialog>
      <dialog
        ref={revoke}
        className="form-dialog"
        aria-labelledby="revoke-source-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <h2 id="revoke-source-title">停用此来源？</h2>
        <p>
          关联知识将停止用于新的检索和上下文。历史运行、知识版本和来源快照会保留。
        </p>
        <div className="dialog-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => revoke.current?.close()}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              void perform(async () => {
                if (!selected) return;
                await invoke("revoke_source", {
                  workspaceId: workspace,
                  sourceId: selected.document.id,
                  expectedRevision: selected.document.revision,
                });
                revoke.current?.close();
                await refresh();
                await read(selected.document.id, selected.version);
              })
            }
          >
            确认停用
          </button>
        </div>
      </dialog>
    </>
  );
}
