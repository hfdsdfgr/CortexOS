import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  GitBranch,
  Info,
  MessageSquare,
  Network,
  Plus,
  Settings,
  Unplug,
  X,
} from "lucide-react";
import { ChatPage } from "./Chat";
import { SettingsPage } from "./Settings";
import { errorText, useStudio } from "./studio";
import "./App.css";

const pages = [
  { id: "chat", label: "对话", icon: MessageSquare },
  { id: "knowledge", label: "知识", icon: BookOpen },
  { id: "graph", label: "图谱", icon: Network },
  { id: "settings", label: "设置", icon: Settings },
] as const;
function subscribeToNavigation(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function currentPage() {
  const id = window.location.hash.replace("#/", "");
  return pages.find((page) => page.id === id)?.id ?? "chat";
}
function PreviewNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="preview-note">
      <Info size={16} aria-hidden="true" />
      {children}
    </p>
  );
}

function KnowledgePage() {
  return (
    <section className="standard-page" aria-labelledby="page-title">
      <header className="page-heading">
        <div>
          <h1 id="page-title">知识</h1>
          <p>把有价值的内容，整理成有来源、有版本的项目知识。</p>
        </div>
        <button className="button secondary" disabled title="知识编辑尚未开放">
          <Plus size={16} aria-hidden="true" />
          新建知识
        </button>
      </header>
      <div className="page-content knowledge-content">
        <div className="list-summary">
          <h2>全部知识</h2>
          <span className="muted">尚无条目</span>
        </div>
        <div className="table-scroll">
          <table className="knowledge-table">
            <caption className="sr-only">项目知识列表</caption>
            <thead>
              <tr>
                <th scope="col">标题</th>
                <th scope="col">类型</th>
                <th scope="col">状态</th>
                <th scope="col">来源</th>
                <th scope="col">更新时间</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={5}>
                  <div className="table-empty">
                    <BookOpen size={32} strokeWidth={1.5} aria-hidden="true" />
                    <h2>让每条知识都有来处</h2>
                    <p>
                      知识功能开放后，你可以手动记录，
                      <br />
                      或把对话中的有用内容保存为待确认草案。
                    </p>
                    <a className="button text-button" href="#/chat">
                      返回对话
                      <ChevronRight size={16} aria-hidden="true" />
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <PreviewNote>
          知识编辑、审核与版本历史尚未开放。模型生成的内容不会自动成为已确认知识。
        </PreviewNote>
      </div>
    </section>
  );
}

function GraphPage() {
  const [graph, setGraph] = useState("knowledge");
  const isKnowledge = graph === "knowledge";
  return (
    <section className="standard-page graph-page" aria-labelledby="page-title">
      <header className="page-heading">
        <div>
          <h1 id="page-title">图谱</h1>
          <p>从关系理解项目，从记录追溯每次执行。</p>
        </div>
        <span className="subtle-label">查看器尚未开放</span>
      </header>
      <div className="graph-toolbar">
        <fieldset className="segmented-control">
          <legend className="sr-only">图谱类型</legend>
          <label>
            <input
              type="radio"
              name="graph"
              value="knowledge"
              checked={isKnowledge}
              onChange={() => setGraph("knowledge")}
            />
            <BookOpen size={15} aria-hidden="true" />
            知识关系
          </label>
          <label>
            <input
              type="radio"
              name="graph"
              value="execution"
              checked={!isKnowledge}
              onChange={() => setGraph("execution")}
            />
            <GitBranch size={15} aria-hidden="true" />
            执行过程
          </label>
        </fieldset>
        <span className="muted graph-count">3D 查看器尚未开放</span>
      </div>
      <div className="graph-canvas">
        <div className="graph-empty" aria-live="polite" aria-atomic="true">
          <div className="empty-symbol">
            <Network size={32} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2>
            {isKnowledge
              ? "知识之间的联系，将在这里展开"
              : "在对话中查看实际执行过程"}
          </h2>
          <p>
            {isKnowledge
              ? "查看知识之间的支持、依赖与冲突，选中节点后查看来源与版本。"
              : "从每条回答打开实际执行步骤；三维展示将在后续版本接入。"}
          </p>
          <a
            className="button secondary"
            href={isKnowledge ? "#/knowledge" : "#/chat"}
          >
            {isKnowledge ? "前往知识" : "前往对话"}
            <ChevronRight size={16} aria-hidden="true" />
          </a>
          <span className="empty-footnote">
            当前为图谱页面预览，尚未接入三维数据。
          </span>
        </div>
        <div className="graph-caption">
          <CircleHelp size={15} aria-hidden="true" />
          <span>
            {isKnowledge
              ? "空间位置用于布局，不代表因果或可信程度。"
              : "执行过程记录实际应用事件，不代表模型的内部思维。"}
          </span>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const studio = useStudio();
  const page = useSyncExternalStore(subscribeToNavigation, currentPage);
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
    if (previousPage.current !== page) mainRef.current?.focus();
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
            {studio.desktop ? "本地对话 Alpha" : "界面预览"}
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
        {page === "chat" && (
          <ChatPage studio={studio} onCreateWorkspace={openCreateWorkspace} />
        )}
        {page === "knowledge" && <KnowledgePage />}
        {page === "graph" && <GraphPage />}
        {page === "settings" && <SettingsPage studio={studio} />}
      </main>
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
              .then(() => workspaceDialog.current?.close())
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
