import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowUp,
  BookOpen,
  ChevronRight,
  CircleHelp,
  Database,
  FileText,
  GitBranch,
  HardDrive,
  Info,
  MessageSquare,
  Network,
  Plus,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Unplug,
} from "lucide-react";
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

function ChatPage() {
  return (
    <div className="chat-layout">
      <aside className="conversation-sidebar" aria-label="会话列表">
        <div className="sidebar-heading">
          <h2>会话</h2>
          <span className="count">0</span>
        </div>
        <button
          className="button secondary new-conversation"
          disabled
          title="对话功能尚未开放"
        >
          <Plus size={16} aria-hidden="true" />
          新建对话
        </button>
        <div className="sidebar-empty">
          <MessageSquare size={22} aria-hidden="true" />
          <p>还没有会话</p>
          <span>对话开放后，你的讨论会保存在这里。</span>
        </div>
        <p className="sidebar-footer">
          <HardDrive size={14} aria-hidden="true" />
          为本地工作而设计
        </p>
      </aside>
      <section className="chat-main" aria-labelledby="page-title">
        <header className="page-heading">
          <div>
            <h1 id="page-title">对话</h1>
            <p>让问题、依据与决定，留在同一个工作区。</p>
          </div>
          <span className="subtle-label">尚未开放</span>
        </header>
        <div className="chat-empty">
          <div className="empty-symbol">
            <MessageSquare size={30} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2>从一次对话开始</h2>
          <p>
            连接本地模型，围绕项目展开讨论。
            <br />
            有价值的内容，之后可以整理为可追溯的知识。
          </p>
          <a className="button primary" href="#/settings">
            查看模型设置
            <ChevronRight size={16} aria-hidden="true" />
          </a>
          <span className="empty-footnote">
            当前为界面预览，对话与保存功能尚未开放。
          </span>
        </div>
        <div className="composer-area">
          <div className="context-summary">
            <FileText size={15} aria-hidden="true" />
            <span>本次上下文</span>
            <span className="muted">尚未添加</span>
          </div>
          <div className="composer">
            <label htmlFor="message">你的问题</label>
            <textarea
              id="message"
              rows={2}
              placeholder="对话开放后，在这里输入你的问题…"
              disabled
            />
            <div className="composer-toolbar">
              <span>
                <Unplug size={14} aria-hidden="true" />
                模型尚未接入
              </span>
              <button
                className="send-button"
                disabled
                aria-label="发送消息（尚未开放）"
              >
                <ArrowUp size={19} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p className="composer-help">
            回答需要结合来源判断；保存为知识后仍需你审核。
          </p>
        </div>
      </section>
    </div>
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
        <span className="muted graph-count">
          尚无{isKnowledge ? "知识节点" : "执行记录"}
        </span>
      </div>
      <div className="graph-canvas">
        <div className="graph-empty" aria-live="polite" aria-atomic="true">
          <div className="empty-symbol">
            <Network size={32} strokeWidth={1.5} aria-hidden="true" />
          </div>
          <h2>
            {isKnowledge
              ? "知识之间的联系，将在这里展开"
              : "每次执行，都有清晰的记录"}
          </h2>
          <p>
            {isKnowledge
              ? "查看知识之间的支持、依赖与冲突，选中节点后查看来源与版本。"
              : "查看应用实际执行的步骤与状态，包括上下文准备、模型调用与回答完成。"}
          </p>
          <a
            className="button secondary"
            href={isKnowledge ? "#/knowledge" : "#/chat"}
          >
            {isKnowledge ? "前往知识" : "前往对话"}
            <ChevronRight size={16} aria-hidden="true" />
          </a>
          <span className="empty-footnote">
            当前没有图谱数据，3D 查看器尚未接入。
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

function SettingsPage() {
  return (
    <section className="standard-page" aria-labelledby="page-title">
      <header className="page-heading">
        <div>
          <h1 id="page-title">设置</h1>
          <p>管理本地模型、数据与工作环境。</p>
        </div>
      </header>
      <div className="page-content settings-content">
        <section className="settings-section" aria-labelledby="model-settings">
          <div className="section-description">
            <h2 id="model-settings">
              <SlidersHorizontal size={18} aria-hidden="true" />
              模型连接
            </h2>
            <p>通过 Ollama 使用本机模型。</p>
          </div>
          <div className="settings-fields">
            <div className="connection-status">
              <Unplug size={18} aria-hidden="true" />
              <div>
                <strong>连接功能尚未开放</strong>
                <p>当前仅展示连接设置，尚未检测本机服务。</p>
              </div>
            </div>
            <div className="field">
              <label htmlFor="endpoint">服务地址</label>
              <input
                id="endpoint"
                value="http://127.0.0.1:11434"
                readOnly
                aria-describedby="endpoint-help"
              />
              <p id="endpoint-help">
                默认仅连接本机，避免把项目内容发送到其他设备。
              </p>
            </div>
            <div className="field">
              <label htmlFor="model">模型</label>
              <select id="model" disabled aria-describedby="model-help">
                <option>接入后显示已安装模型</option>
              </select>
              <p id="model-help">
                建议从 Qwen3 4B 开始，根据实际显存和速度调整。
              </p>
            </div>
            <button
              className="button secondary"
              disabled
              aria-describedby="connection-help"
            >
              测试连接
            </button>
            <span id="connection-help" className="inline-help">
              功能开放后可用
            </span>
            <details className="advanced-settings">
              <summary>默认生成参数</summary>
              <dl>
                <div>
                  <dt>上下文长度</dt>
                  <dd>4096 tokens</dd>
                </div>
                <div>
                  <dt>温度</dt>
                  <dd>0.3</dd>
                </div>
                <div>
                  <dt>最大输出</dt>
                  <dd>512 tokens</dd>
                </div>
                <div>
                  <dt>并行生成</dt>
                  <dd>1 个任务</dd>
                </div>
              </dl>
              <p>以上为规划默认值，尚未应用到模型请求。</p>
            </details>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="data-settings">
          <div className="section-description">
            <h2 id="data-settings">
              <Database size={18} aria-hidden="true" />
              本地数据
            </h2>
            <p>项目内容由你掌控。</p>
          </div>
          <div className="settings-fields">
            <dl className="data-summary">
              <div>
                <dt>工作区与会话保存</dt>
                <dd>尚未开放</dd>
              </div>
              <div>
                <dt>文件访问</dt>
                <dd>尚未授权任何来源</dd>
              </div>
              <div>
                <dt>备份与导出</dt>
                <dd>后续版本提供</dd>
              </div>
            </dl>
            <p className="privacy-note">
              <ShieldCheck size={17} aria-hidden="true" />
              默认在本机处理数据。导入文件前，由你明确选择访问范围。
            </p>
          </div>
        </section>
        <section className="settings-section" aria-labelledby="about-settings">
          <div className="section-description">
            <h2 id="about-settings">
              <Info size={18} aria-hidden="true" />
              关于
            </h2>
          </div>
          <div className="settings-fields">
            <div className="about-line">
              <strong>CortexOS</strong>
              <span className="version-label">0.1.0 · 界面预览</span>
            </div>
            <p className="muted">
              本地认知工作台。当前可浏览四个核心页面，模型、保存与图谱功能正在建设中。
            </p>
          </div>
        </section>
      </div>
    </section>
  );
}

export default function App() {
  const page = useSyncExternalStore(subscribeToNavigation, currentPage);
  const mainRef = useRef<HTMLElement>(null);
  const previousPage = useRef(page);

  useEffect(() => {
    const label = pages.find((item) => item.id === page)?.label;
    document.title = `${label} · CortexOS`;
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
        <div className="workspace-label">
          <span className="header-divider" />
          <span>尚未创建工作区</span>
        </div>
        <div className="header-status">
          <span className="preview-label">界面预览</span>
          <a href="#/settings" className="model-status">
            <Unplug size={15} aria-hidden="true" />
            <span>模型尚未接入</span>
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
        {page === "chat" && <ChatPage />}
        {page === "knowledge" && <KnowledgePage />}
        {page === "graph" && <GraphPage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}
