import { useEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeft, X, Plus, BookOpen } from "lucide-react";
import type { Studio } from "../studio";
import { navigate, type PageName } from "../navigation";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ModelStatus } from "./ModelStatus";
import { ConversationList } from "./ConversationList";
import { NavigationIcon } from "./NavigationIcon";
import { WindowControls, WindowDragRegion } from "./WindowControls";
import { AppearanceControl } from "./AppearanceControl";
import { Toast } from "./Toast";
export const pages = [
  { id: "chat", label: "对话" }, { id: "knowledge", label: "知识" },
  { id: "graph", label: "图谱" }, { id: "settings", label: "设置" },
] as const;
function Brand() {
  return <a className="prototype-brand" href="#/chat" aria-label="CortexOS 首页">
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke="var(--primary)" strokeWidth="1.5" /><circle cx="14" cy="14" r="4.5" fill="var(--primary)" /><circle cx="20.5" cy="8" r="2.2" fill="var(--success)" /></svg>
    <span>CortexOS <span className="brand-dimension">3D</span></span>
  </a>;
}
export function AppShell({ studio, page, openCreateWorkspace, children }: {
  studio: Studio; page: PageName; openCreateWorkspace: () => void; children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [narrow, setNarrow] = useState(() => matchMedia("(max-width: 900px)").matches);
  const drawer = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const query = matchMedia("(max-width: 900px)");
    const update = () => { setNarrow(query.matches); if (!query.matches) drawer.current?.close(); };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const conversation = studio.conversations.find(item => item.id === studio.conversationId);
  const sidebar = (mobile: boolean) => <>
    <Brand />
    <button className="button secondary new-thread" disabled={!studio.desktop || !studio.workspaceId || studio.loading || studio.creatingConversation || studio.sending} onClick={() => {
      void studio.newConversation().then(item => { navigate("chat", { workspace: item.workspaceId, conversation: item.id }); drawer.current?.close(); }).catch(studio.reportError);
    }}><Plus size={16} aria-hidden="true" />{studio.creatingConversation ? "正在创建…" : "新建对话"}</button>
    <nav className="primary-navigation" aria-label={mobile ? "移动主导航" : "主导航"}>
      {pages.map(({id, label}) => <a key={id} href={`#/${id}`} title={label} aria-label={label} aria-current={page === id ? "page" : undefined} onClick={() => drawer.current?.close()}><NavigationIcon page={id} /><span>{label}</span></a>)}
    </nav>
    <div className="sidebar-threads"><ConversationList studio={studio} onSelect={() => drawer.current?.close()} /></div>
    <div className="sidebar-workspace">
      <WorkspaceSwitcher studio={studio} page={page} openCreateWorkspace={() => { drawer.current?.close(); openCreateWorkspace(); }} />
      <a className="button secondary" href="#/knowledge" onClick={() => drawer.current?.close()}><BookOpen size={14} aria-hidden="true" />查看知识</a>
    </div>
  </>;
  return <div className={`app-shell prototype-shell reference-chat page-${page} ${collapsed ? "sidebar-collapsed" : ""}`}>
    <a className="skip-link" href="#main-content" onClick={event => {event.preventDefault();document.getElementById("main-content")?.focus();}}>跳到主要内容</a>
    <aside id="primary-sidebar" className="prototype-sidebar reference-sidebar">{!mobileOpen && sidebar(false)}</aside>
    <div className="workspace-stage">
      <header className="prototype-topbar">
        <button className="icon-button navigation-toggle" aria-label={narrow ? "打开导航" : collapsed ? "展开全局导航" : "收起全局导航"} aria-expanded={narrow ? mobileOpen : !collapsed} aria-controls={narrow ? "mobile-navigation" : "primary-sidebar"} aria-haspopup={narrow ? "dialog" : undefined} title="切换侧栏" onClick={() => {
          if (narrow) { drawer.current?.showModal(); setMobileOpen(true); } else setCollapsed(!collapsed);
        }}><PanelLeft size={18} /></button>
        <div className="topbar-title"><strong>{page === "chat" ? conversation?.title ?? "新的对话" : pages.find(item => item.id === page)?.label}</strong><span>{studio.data?.workspaces.find(item => item.id === studio.workspaceId)?.name ?? "本地工作区"}</span></div>
        {studio.desktop ? <WindowDragRegion onError={studio.reportError} /> : <span className="topbar-spacer" />}
        <ModelStatus studio={studio} />
        <AppearanceControl />
        {studio.desktop && <WindowControls onError={studio.reportError} />}
      </header>
      {children}
    </div>
    <dialog id="mobile-navigation" ref={drawer} className="mobile-sidebar panel-dialog" aria-labelledby="mobile-navigation-title" onClose={() => setMobileOpen(false)}>
      <header className="panel-header"><h2 id="mobile-navigation-title">导航与会话</h2><button className="icon-button" aria-label="关闭导航" onClick={() => drawer.current?.close()}><X size={18} /></button></header>
      <div className="panel-body">{mobileOpen && sidebar(true)}</div>
    </dialog>
    <Toast />
  </div>;
}
