import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  Pencil,
  Plus,
  Search,
  X,
  PanelLeft,
  History,
} from "lucide-react";
import { navigate, useNavigation } from "./navigation";
import { errorText, type Message, type Studio } from "./studio";

export const kinds: Record<string, string> = {
  knowledge: "知识",
  context: "背景",
  hypothesis: "假设",
  decision: "决定",
  evidence: "证据",
  conflict: "争议",
};
export interface KnowledgeNode {
  id: string;
  workspaceId: string;
  title: string;
  kind: string;
  latestVersion: number;
  effectiveVersion: number | null;
  revision: number;
  updatedAt: string;
  sourceMessageId: string | null;
}
interface Version {
  version: number;
  title: string;
  kind: string;
  content: string;
  changeReason: string;
  createdAt: string;
  approvedAt: string | null;
}
export interface KnowledgeDetail {
  node: KnowledgeNode;
  versions: Version[];
  sourceConversationId: string | null;
  sourceExcerpt: string | null;
  sourceHash: string | null;
}
export interface EditKnowledge {
  returnTo?: "graph";
  workspaceId: string;
  detail?: KnowledgeDetail;
  source?: Message;
  excerpt?: string;
}
export const getKnowledge = (workspaceId: string, nodeId: string) =>
  invoke<KnowledgeDetail>("get_knowledge", { workspaceId, nodeId });
const status = (node: KnowledgeNode) =>
  node.latestVersion === node.effectiveVersion
    ? "已确认"
    : node.effectiveVersion
      ? "有新草案"
      : "待确认";
const date = (value: string) => new Date(value).toLocaleString("zh-CN");

export function KnowledgePage({
  studio,
  selected,
  onSelect,
  revision,
  onEdit,
  requestedVersion,
}: {
  studio: Studio;
  selected: string | null;
  requestedVersion?: number;
  onSelect: (id: string | null) => void;
  revision: number;
  onEdit: (request: EditKnowledge) => void;
}) {
  const workspace = studio.workspaceId;
  const [listOpen, setListOpen] = useState(true);
  const [items, setItems] = useState<KnowledgeNode[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let current = true;
    setItems([]);
    setError(null);
    setLoading(false);
    if (!studio.desktop || !workspace) return;
    setLoading(true);
    void invoke<KnowledgeNode[]>("list_knowledge", { workspaceId: workspace })
      .then((data) => {
        if (current) setItems(data);
      })
      .catch((e) => {
        if (current) setError(errorText(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [workspace, studio.desktop, revision, refresh]);
  const shown = items.filter(
    (item) =>
      item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (filter === "all" ||
        (filter === "pending"
          ? item.latestVersion !== item.effectiveVersion
          : item.latestVersion === item.effectiveVersion)),
  );
  return (
    <section
      className="standard-page knowledge-page"
      aria-labelledby="page-title"
    >
      <header className="page-heading">
        <div className="knowledge-page-location">
          <button
            className="icon-button"
            aria-label={listOpen ? "收起知识列表" : "展开知识列表"}
            aria-expanded={listOpen}
            onClick={() => setListOpen(!listOpen)}
          >
            <PanelLeft size={18} />
          </button>
          <h1 id="page-title">知识</h1>
        </div>
        <button
          className="button primary"
          disabled={!studio.desktop || !workspace}
          onClick={() => onEdit({ workspaceId: workspace! })}
        >
          <Plus size={16} />
          新建知识
        </button>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button
            className="button text-button"
            onClick={() => setRefresh((n) => n + 1)}
          >
            重新读取
          </button>
        </div>
      )}
      <div
        className={`knowledge-workbench ${selected ? "has-selection" : ""} ${listOpen ? "" : "list-collapsed"}`}
      >
        <aside className="knowledge-sidebar">
          <section className="knowledge-list-pane" aria-label="知识列表">
            <div className="knowledge-filters">
              <label className="search-field">
                <Search size={16} />
                <input
                  aria-label="搜索知识标题"
                  placeholder="搜索标题"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                aria-label="知识状态筛选"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">全部状态</option>
                <option value="pending">待确认 / 新草案</option>
                <option value="confirmed">已确认</option>
              </select>
            </div>
            {loading ? (
              <p className="inline-loading" role="status">
                正在读取知识…
              </p>
            ) : shown.length ? (
              <ul className="knowledge-list">
                {shown.map((item) => (
                  <li key={item.id}>
                    <button
                      className="knowledge-row"
                      aria-current={selected === item.id ? "true" : undefined}
                      onClick={() => onSelect(item.id)}
                    >
                      <span className="knowledge-row-title">{item.title}</span>
                      <span className="knowledge-row-meta">
                        <span>{kinds[item.kind]}</span>
                        <span
                          className={
                            item.latestVersion === item.effectiveVersion
                              ? "connected"
                              : "pending-status"
                          }
                        >
                          {status(item)}
                        </span>
                        <span>v{item.latestVersion}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="knowledge-empty">
                <BookOpen size={28} />
                <h2>
                  {query || filter !== "all" ? "没有匹配的知识" : "还没有知识"}
                </h2>
                <p>
                  {!studio.desktop
                    ? "在桌面程序中管理知识。"
                    : !workspace
                      ? "先创建或选择工作区。"
                      : "手动记录，或从回答保存草案。"}
                </p>
                {(query || filter !== "all") && (
                  <button
                    className="button text-button"
                    onClick={() => {
                      setQuery("");
                      setFilter("all");
                    }}
                  >
                    清除筛选
                  </button>
                )}
              </div>
            )}
          </section>
        </aside>
        <KnowledgeInspector
          studio={studio}
          workspace={workspace}
          selected={selected}
          requestedVersion={requestedVersion}
          revision={revision}
          onBack={() => {
            setListOpen(true);
            onSelect(null);
          }}
          onEdit={onEdit}
          onChanged={() => setRefresh((n) => n + 1)}
        />
      </div>
    </section>
  );
}

export function KnowledgeInspector({
  studio,
  workspace,
  selected,
  revision,
  onBack,
  onEdit,
  onChanged,
  requestedVersion,
}: {
  studio: Studio;
  workspace: string | null;
  selected: string | null;
  revision: number;
  onBack: () => void;
  onEdit: (request: EditKnowledge) => void;
  onChanged?: () => void;
  requestedVersion?: number;
}) {
  const route = useNavigation();
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const historyDialog = useRef<HTMLDialogElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const closeHistory = () => {
    historyDialog.current?.close();
    historyButton.current?.focus();
  };
  useEffect(() => {
    historyDialog.current?.close();
  }, [workspace, selected]);
  const approval = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let current = true;
    setDetail(null);
    setError(null);
    setLoadingDetail(false);
    if (!workspace || !selected) return;
    setLoadingDetail(true);
    void getKnowledge(workspace, selected)
      .then((data) => {
        if (current) {
          setDetail(data);
        }
      })
      .catch((e) => {
        if (current) setError(errorText(e));
      })
      .finally(() => {
        if (current) setLoadingDetail(false);
      });
    return () => {
      current = false;
    };
  }, [workspace, selected, revision, refresh]);
  useEffect(() => {
    setVersion(requestedVersion ?? null);
    if (detail) {
      setError(
        requestedVersion &&
          !detail.versions.some((v) => v.version === requestedVersion)
          ? "指定知识版本不存在，请从版本历史中选择已有版本。"
          : null,
      );
    }
  }, [requestedVersion, detail]);

  const currentVersion = detail?.versions.find(
    (item) => item.version === (version ?? detail.node.latestVersion),
  );
  const effective = detail?.versions.find(
    (item) => item.version === detail.node.effectiveVersion,
  );
  const history =
    detail && currentVersion ? (
      <details
        className="knowledge-disclosure version-history"
        open={route.page === "knowledge" ? true : undefined}
      >
        <summary>{route.page === "knowledge" ? `${detail.versions.length} 个版本` : `版本历史（${detail.versions.length}）`}</summary>
        <div className="version-picker">
          <label htmlFor="knowledge-version">查看版本</label>
          <select
            id="knowledge-version"
            value={currentVersion.version}
            onChange={(e) => {
              setVersion(Number(e.target.value));
              navigate(route.page, {
                workspace,
                node: selected,
                version: Number(e.target.value),
                mode: route.page === "graph" ? "knowledge" : undefined,
                back: route.back,
              });
            }}
          >
            {detail.versions.map((item) => (
              <option key={item.version} value={item.version}>
                v{item.version} · {item.approvedAt ? "已确认过" : "草案"}
              </option>
            ))}
          </select>
        </div>
        <ol className="knowledge-history">
          {detail.versions.map((item) => (
            <li key={item.version}>
              <button
                className="version-entry"
                aria-current={
                  currentVersion.version === item.version ? "true" : undefined
                }
                onClick={() => {
                  setVersion(item.version);
                  navigate(route.page, {
                    workspace,
                    node: selected,
                    version: item.version,
                    mode: route.page === "graph" ? "knowledge" : undefined,
                    back: route.back,
                  });
                }}
              >
                <strong>{item.changeReason}</strong>
                <span>
                  v{item.version} · {item.approvedAt ? "已确认过" : "草案"}
                </span>
              </button>
              <span>保存于 {date(item.createdAt)}</span>
              {item.approvedAt && <span>确认于 {date(item.approvedAt)}</span>}
            </li>
          ))}
        </ol>
      </details>
    ) : (
      <p className="history-empty">选择知识后查看版本历史。</p>
    );
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}
          <button
            className="button text-button"
            onClick={() => setRefresh((n) => n + 1)}
          >
            重新读取
          </button>
        </p>
      )}{" "}
      <section className="knowledge-detail" aria-label="知识详情">
        {selected && (
          <button
            className="button text-button knowledge-back"
            onClick={() => onBack()}
          >
            返回知识列表
          </button>
        )}
        {loadingDetail ? (
          <p role="status">正在读取版本…</p>
        ) : detail && currentVersion ? (
          <>
            <header className="knowledge-detail-heading">
              <div>
                <span className="knowledge-kind">
                  {kinds[currentVersion.kind]} / v{currentVersion.version}
                </span>
                <h2>{currentVersion.title}</h2>
                <p className="knowledge-state">
                  {route.page === "knowledge" && `${kinds[currentVersion.kind]} · v${currentVersion.version} · `}
                  {status(detail.node)}
                  {detail.node.effectiveVersion
                    ? ` · 生效版本 v${detail.node.effectiveVersion}`
                    : " · 尚无生效版本"}
                </p>
              </div>
              <div className="knowledge-detail-actions">
                {route.page === "knowledge" && (
                  <button
                    ref={historyButton}
                    className="button secondary"
                    onClick={() => historyDialog.current?.show()}
                    aria-haspopup="dialog"
                  >
                    <History size={16} />
                    版本历史
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => onEdit({ workspaceId: workspace!, detail })}
                >
                  <Pencil size={15} />
                  修改草案
                </button>
              </div>
            </header>
            <div className="knowledge-prose">{currentVersion.content}</div>
            {route.page === "knowledge" && (
              <button
                className="button text-button"
                onClick={() =>
                  navigate("graph", {
                    workspace,
                    mode: "knowledge",
                    node: selected,
                    version: currentVersion.version,
                    back: route.back,
                  })
                }
              >
                在知识图谱定位
              </button>
            )}
            {detail.node.latestVersion !== detail.node.effectiveVersion && (
              <div className="knowledge-review">
                <span>最新草案 v{detail.node.latestVersion}</span>
                <button
                  className="button primary"
                  onClick={() => approval.current?.showModal()}
                >
                  <Check size={16} />
                  审核并确认
                </button>
              </div>
            )}
            {effective && effective.version !== currentVersion.version && (
              <details className="knowledge-disclosure">
                <summary>对照当前生效版本 v{effective.version}</summary>
                <h3>{effective.title}</h3>
                <p>{kinds[effective.kind]}</p>
                <div className="knowledge-prose">{effective.content}</div>
              </details>
            )}
            {route.page === "knowledge" ? (
              <dialog
                ref={historyDialog}
                className="knowledge-history-drawer"
                aria-labelledby="knowledge-history-title"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeHistory();
                  }
                }}
              >
                <header className="history-drawer-heading">
                  <h2 id="knowledge-history-title">版本历史</h2>
                  <button
                    className="icon-button"
                    aria-label="关闭版本历史"
                    onClick={closeHistory}
                  >
                    <X size={20} />
                  </button>
                </header>
                <p className="history-document-title">{detail.node.title}</p>
                {history}
              </dialog>
            ) : (
              history
            )}
            <details className="knowledge-disclosure">
              <summary>
                {detail.sourceExcerpt ? "回答来源" : "来源：手动记录"}
              </summary>
              {detail.sourceExcerpt ? (
                <>
                  <blockquote>{detail.sourceExcerpt}</blockquote>
                  <button
                    className="button text-button"
                    onClick={() => {
                      void studio
                        .openConversation(
                          workspace!,
                          detail.sourceConversationId!,
                        )
                        .then(() => {
                          navigate("chat", {
                            workspace,
                            conversation: detail.sourceConversationId,
                            message: detail.node.sourceMessageId,
                            back: route.back,
                          });
                        })
                        .catch(studio.reportError);
                    }}
                  >
                    打开原会话
                  </button>
                  <p>此摘录记录最初来源，修改后的内容需单独审核。</p>
                  <code className="source-hash">
                    SHA-256 {detail.sourceHash}
                  </code>
                </>
              ) : (
                <p>由用户手动记录，没有引用模型回答。</p>
              )}
            </details>
            <dialog
              ref={approval}
              className="form-dialog approval-dialog"
              aria-labelledby="approval-title"
              onCancel={(e) => {
                if (approving) e.preventDefault();
              }}
            >
              <h2 id="approval-title">确认知识版本</h2>
              <p>
                将“{detail.versions[0].title}”的 v{detail.node.latestVersion}{" "}
                设为生效版本。确认表示你已审核，不代表系统验证了事实。
              </p>
              <div className="approval-content">
                {detail.versions[0].content}
              </div>
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  disabled={approving}
                  onClick={() => approval.current?.close()}
                >
                  返回检查
                </button>
                <button
                  className="button primary"
                  disabled={approving}
                  onClick={() => {
                    setApproving(true);
                    void invoke("approve_knowledge", {
                      workspaceId: workspace,
                      nodeId: detail.node.id,
                      expectedRevision: detail.node.revision,
                    })
                      .then(() => {
                        approval.current?.close();
                        setRefresh((n) => n + 1);
                        onChanged?.();
                      })
                      .catch((e) => {
                        approval.current?.close();
                        setError(errorText(e));
                      })
                      .finally(() => setApproving(false));
                  }}
                >
                  {approving ? "正在确认…" : "确认此版本"}
                </button>
              </div>
            </dialog>
          </>
        ) : (
          !loadingDetail && (
            <div className="knowledge-empty detail-empty">
              <h2>选择一条知识</h2>
              <p>查看内容、来源与版本。</p>
            </div>
          )
        )}
      </section>
    </>
  );
}

export function KnowledgeEditor({
  request,
  onClose,
  onSaved,
}: {
  request: EditKnowledge;
  onClose: () => void;
  onSaved: (workspaceId: string, nodeId: string) => void;
}) {
  const original = request.detail?.versions[0];
  const [title, setTitle] = useState(original?.title ?? "");
  const [kind, setKind] = useState(original?.kind ?? "knowledge");
  const [content, setContent] = useState(
    original?.content ?? request.excerpt ?? "",
  );
  const [reason, setReason] = useState(
    original ? "" : request.source ? "从回答保存草案" : "手动记录",
  );
  const [excerpt, setExcerpt] = useState(request.excerpt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [latest, setLatest] = useState<KnowledgeDetail | null>(null);
  const [expected, setExpected] = useState(
    request.detail?.node.revision ?? null,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const leaving = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const exitWindow = useRef(false);
  const busy = useRef(false);
  const changed =
    excerpt !== (request.excerpt ?? "") ||
    title !== (original?.title ?? "") ||
    kind !== (original?.kind ?? "knowledge") ||
    content !== (original?.content ?? "") ||
    reason !== (original ? "" : request.source ? "从回答保存草案" : "手动记录");
  const dirty = useRef(changed);
  dirty.current = changed;
  const listener = useRef<Promise<() => void> | null>(null);
  const finishClose = async () => {
    if (exitWindow.current) {
      (await listener.current)?.();
      await getCurrentWindow().close();
    }
    onClose();
  };
  const askClose = (window = false) => {
    if (busy.current) return;
    exitWindow.current = window;
    if (dirty.current) leaving.current?.showModal();
    else void finishClose().catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    dialog.current?.showModal();
    listener.current = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      askClose(true);
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      void listener.current?.then((unlisten) => unlisten());
      window.removeEventListener("beforeunload", beforeUnload);
    };
    // This editor is mounted once per request; mutable guards keep its close handler current.
  }, []);
  const save = async (closeAfter = false) => {
    if (!form.current?.reportValidity() || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const id = await invoke<string>("save_knowledge", {
        input: {
          workspaceId: request.workspaceId,
          nodeId: request.detail?.node.id ?? null,
          expectedRevision: expected,
          title,
          kind,
          content,
          changeReason: reason,
          sourceMessageId: request.source?.id ?? null,
          sourceExcerpt: request.source ? excerpt : null,
        },
      });
      dirty.current = false;
      if (closeAfter && exitWindow.current) await finishClose();
      else onSaved(request.workspaceId, id);
    } catch (e) {
      setError(errorText(e));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <dialog
        ref={dialog}
        className="knowledge-editor form-dialog"
        aria-labelledby="knowledge-edit-title"
        onCancel={(e) => {
          e.preventDefault();
          askClose();
        }}
      >
        <form
          ref={form}
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <header className="drawer-heading">
            <h2 id="knowledge-edit-title">
              {original ? "修改知识草案" : "新建知识草案"}
            </h2>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭知识编辑"
              disabled={saving}
              onClick={() => askClose()}
            >
              <X size={20} />
            </button>
          </header>
          <div className="knowledge-edit-fields">
            <div className="field">
              <label htmlFor="knowledge-title">标题</label>
              <input
                id="knowledge-title"
                value={title}
                maxLength={80}
                required
                readOnly={saving}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="knowledge-kind">类型</label>
              <select
                id="knowledge-kind"
                value={kind}
                disabled={saving}
                onChange={(e) => setKind(e.target.value)}
              >
                {Object.entries(kinds).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="knowledge-content">正文</label>
            <textarea
              id="knowledge-content"
              rows={9}
              value={content}
              required
              maxLength={20000}
              readOnly={saving}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {request.source && (
            <details className="knowledge-disclosure">
              <summary>来源摘录（可缩短为原文片段）</summary>
              <label className="sr-only" htmlFor="knowledge-excerpt">
                来源摘录
              </label>
              <textarea
                id="knowledge-excerpt"
                rows={4}
                value={excerpt}
                maxLength={20000}
                readOnly={saving}
                onChange={(e) => setExcerpt(e.target.value)}
              />
              <p>
                摘录须保留原文，知识正文可以改写。来源不会自动证明正文正确。
              </p>
            </details>
          )}
          <div className="field">
            <label htmlFor="knowledge-reason">
              {original ? "修改说明" : "记录说明"}
            </label>
            <input
              id="knowledge-reason"
              value={reason}
              required
              maxLength={500}
              readOnly={saving}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {error && request.detail && (
            <button
              type="button"
              className="button text-button"
              disabled={saving}
              onClick={() => {
                void getKnowledge(request.workspaceId, request.detail!.node.id)
                  .then(setLatest)
                  .catch((e) => setError(errorText(e)));
              }}
            >
              查看最新版本
            </button>
          )}
          {latest && (
            <div className="conflict-comparison">
              <h3>
                最新版本 v{latest.node.latestVersion}：
                {latest.versions[0].title}
              </h3>
              <div className="knowledge-prose">
                {latest.versions[0].content}
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setExpected(latest.node.revision);
                  setLatest(null);
                  setError(null);
                }}
              >
                已比较，保留我的编辑并重新保存
              </button>
            </div>
          )}
          <footer className="dialog-actions">
            <span className="editor-status">
              {request.detail?.node.effectiveVersion
                ? `保存后仍以 v${request.detail.node.effectiveVersion} 生效`
                : "保存为待确认草案"}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => askClose()}
            >
              取消
            </button>
            <button className="button primary" disabled={saving}>
              {saving ? "正在保存…" : "保存草案"}
            </button>
          </footer>
        </form>
      </dialog>
      <dialog
        ref={leaving}
        className="form-dialog"
        aria-labelledby="leave-knowledge-title"
        onCancel={() => {
          exitWindow.current = false;
        }}
      >
        <h2 id="leave-knowledge-title">保留未保存的修改？</h2>
        <p>保存后将新增待确认草案。</p>
        <div className="dialog-actions">
          <button
            className="button text-button"
            onClick={() => {
              dirty.current = false;
              void finishClose().catch((e) => setError(errorText(e)));
            }}
          >
            放弃修改
          </button>
          <button
            className="button secondary"
            onClick={() => {
              exitWindow.current = false;
              leaving.current?.close();
            }}
          >
            继续编辑
          </button>
          <button
            className="button primary"
            onClick={() => {
              leaving.current?.close();
              void save(true);
            }}
          >
            保存草案
          </button>
        </div>
      </dialog>
    </>
  );
}
