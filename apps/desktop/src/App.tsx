import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  MessageSquare,
  Network,
  Plus,
  Settings,
  Unplug,
  X,
} from "lucide-react";
import {
  KnowledgePage,
  KnowledgeEditor,
  type EditKnowledge,
} from "./Knowledge";
import { ChatPage } from "./Chat";
import { GraphPage, RelationshipEditor, type EditEdge } from "./Graph";
import { SettingsPage } from "./Settings";
import { errorText, useStudio } from "./studio";
import "./App.css";
import { useNavigation, navigate } from "./navigation";

const pages = [
  { id: "chat", label: "对话", icon: MessageSquare },
  { id: "knowledge", label: "知识", icon: BookOpen },
  { id: "graph", label: "图谱", icon: Network },
  { id: "settings", label: "设置", icon: Settings },
] as const;
export default function App() {
  const studio = useStudio();
  const [edgeEdit, setEdgeEdit] = useState<EditEdge | null>(null);
  const [knowledgeEdit, setKnowledgeEdit] = useState<EditKnowledge | null>(
    null,
  );
  const [knowledgeSelection, setKnowledgeSelection] = useState<{
    workspace: string;
    id: string;
  } | null>(null);
  const [knowledgeRevision, setKnowledgeRevision] = useState(0);
  const route = useNavigation();
  const page = route.page;
  useEffect(() => {
    if (studio.loading || !studio.data || !route.workspace) return;
    if (!studio.data.workspaces.some((item) => item.id === route.workspace)) {
      studio.reportError("目标工作区不存在。请选择可用工作区。");
      return;
    }
    let current = true;
    void (async () => {
      if (studio.workspaceId !== route.workspace)
        await studio.openWorkspace(route.workspace!);
      if (
        current &&
        route.conversation &&
        studio.conversationId !== route.conversation
      )
        await studio.openConversation(route.workspace!, route.conversation);
    })().catch(studio.reportError);
    return () => {
      current = false;
    };
  }, [route.workspace, route.conversation, studio.loading, !!studio.data]);
  const mainRef = useRef<HTMLElement>(null);
  const previousPage = useRef(page);
  const workspaceDialog = useRef<HTMLDialogElement>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const openCreateWorkspace = () => {
    setWorkspaceName("");
    setWorkspaceError(null);
    workspaceDialog.current?.showModal();
  };
  useEffect(() => {
    document.title = `${pages.find((item) => item.id === page)?.label} · CortexOS`;
    if (previousPage.current !== page && !(page === "chat" && route.message))
      mainRef.current?.focus();
    previousPage.current = page;
  }, [page]);
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        跳到主要内容
      </a>
      <header className="app-header">
        <a className="brand" href="#/chat" aria-label="CortexOS 首页">
          <img src="/cortex.svg" width="30" height="30" alt="" />
          <span>CortexOS</span>
        </a>
        <div className="workspace-picker">
          <label className="sr-only" htmlFor="current-workspace">
            当前工作区
          </label>
          <select
            id="current-workspace"
            value={studio.workspaceId ?? ""}
            disabled={!studio.desktop || !studio.data || studio.loading}
            onChange={(event) => {
              void studio
                .openWorkspace(event.target.value)
                .then(() => navigate(page))
                .catch(studio.reportError);
            }}
          >
            {!studio.workspaceId && <option value="">尚未创建工作区</option>}
            {studio.data?.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            aria-label="新建工作区"
            title="新建工作区"
            disabled={!studio.desktop || !studio.data || studio.loading}
            onClick={openCreateWorkspace}
          >
            <Plus size={17} aria-hidden="true" />
          </button>
        </div>
        <div className="header-status">
          <span className="preview-label">
            {studio.desktop ? "认知工作台 Alpha" : "界面预览"}
          </span>
          <a
            href="#/settings"
            className={`model-status ${studio.health ? "connected" : ""}`}
          >
            {studio.health ? (
              <CheckCircle2 size={15} aria-hidden="true" />
            ) : (
              <Unplug size={15} aria-hidden="true" />
            )}
            <span>
              {studio.checking
                ? "正在检测…"
                : studio.health
                  ? studio.health.models.length
                    ? "Ollama 已连接"
                    : "尚未安装模型"
                  : "模型未连接"}
            </span>
            <ChevronRight size={14} aria-hidden="true" />
          </a>
        </div>
      </header>
      <nav className="main-navigation" aria-label="主导航">
        {pages.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`#/${id}`}
            className={`navigation-link ${id === "settings" ? "settings-link" : ""}`}
            aria-current={page === id ? "page" : undefined}
          >
            <Icon size={22} strokeWidth={1.7} aria-hidden="true" />
            <span>{label}</span>
          </a>
        ))}
        <span className="navigation-version" aria-label="版本 0.1">
          v0.1
        </span>
      </nav>
      <main
        id="main-content"
        className="main-content"
        ref={mainRef}
        tabIndex={-1}
      >
        {studio.loading && (
          <p className="startup-status" role="status">
            正在读取本地工作区…
          </p>
        )}
        {studio.error && (
          <div className="error-banner" role="alert">
            <div>
              <strong>操作未完成</strong>
              <p>{studio.error}</p>
              {!studio.data && studio.desktop && (
                <button
                  className="button text-button"
                  onClick={() => {
                    void studio.reload();
                  }}
                >
                  重试读取
                </button>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="关闭错误提示"
              onClick={studio.clearError}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {route.back && (
          <a className="button text-button return-to-trace" href={route.back}>
            返回执行轨迹
          </a>
        )}
        {page === "chat" && (
          <ChatPage
            studio={studio}
            onCreateWorkspace={openCreateWorkspace}
            onSaveKnowledge={(source, excerpt) =>
              setKnowledgeEdit({
                workspaceId: source.workspaceId,
                source,
                excerpt,
              })
            }
          />
        )}
        {page === "knowledge" && (
          <KnowledgePage
            key={studio.workspaceId ?? "preview"}
            studio={studio}
            selected={
              route.node ??
              (knowledgeSelection?.workspace === studio.workspaceId
                ? knowledgeSelection.id
                : null)
            }
            requestedVersion={route.version}
            onSelect={(id) => {
              setKnowledgeSelection(
                id && studio.workspaceId
                  ? { workspace: studio.workspaceId, id }
                  : null,
              );
              navigate("knowledge", {
                workspace: studio.workspaceId,
                node: id,
              });
            }}
            revision={knowledgeRevision}
            onEdit={setKnowledgeEdit}
          />
        )}
        {page === "graph" && (
          <GraphPage
            studio={studio}
            revision={knowledgeRevision}
            onEdit={setKnowledgeEdit}
            onEditEdge={setEdgeEdit}
          />
        )}
        {page === "settings" && <SettingsPage studio={studio} />}
      </main>
      {edgeEdit && (
        <RelationshipEditor
          request={edgeEdit}
          onClose={() => setEdgeEdit(null)}
          onSaved={() => {
            setEdgeEdit(null);
            setKnowledgeRevision((n) => n + 1);
          }}
        />
      )}
      {knowledgeEdit && (
        <KnowledgeEditor
          request={knowledgeEdit}
          onClose={() => setKnowledgeEdit(null)}
          onSaved={(workspace, id) => {
            setKnowledgeEdit(null);
            setKnowledgeSelection({ workspace, id });
            setKnowledgeRevision((n) => n + 1);
            navigate(
              knowledgeEdit.returnTo === "graph" ? "graph" : "knowledge",
              {
                workspace,
                node: id,
                mode:
                  knowledgeEdit.returnTo === "graph" ? "knowledge" : undefined,
              },
            );
          }}
        />
      )}
      <dialog
        ref={workspaceDialog}
        className="form-dialog"
        aria-labelledby="workspace-title"
        onCancel={(event) => {
          if (creating) event.preventDefault();
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setCreating(true);
            setWorkspaceError(null);
            void studio
              .createWorkspace(workspaceName)
              .then(() => {
                navigate(page);
                workspaceDialog.current?.close();
              })
              .catch((value) => setWorkspaceError(errorText(value)))
              .finally(() => setCreating(false));
          }}
        >
          <h2 id="workspace-title">创建工作区</h2>
          <p>为一个项目或一类工作保留独立的会话。</p>
          <div className="field">
            <label htmlFor="workspace-name">工作区名称</label>
            <input
              id="workspace-name"
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              required
              maxLength={80}
              placeholder="例如：产品设计"
              readOnly={creating}
              aria-describedby={workspaceError ? "workspace-error" : undefined}
            />
          </div>
          {workspaceError && (
            <p id="workspace-error" className="form-error" role="alert">
              {workspaceError}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="button secondary"
              type="button"
              disabled={creating}
              onClick={() => workspaceDialog.current?.close()}
            >
              取消
            </button>
            <button className="button primary" disabled={creating}>
              {creating ? "正在创建…" : "创建工作区"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
