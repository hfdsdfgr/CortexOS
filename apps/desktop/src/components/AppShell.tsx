import { useRef, useState, useEffect, type ReactNode } from "react";
import {
  BookOpen,
  MessageSquare,
  Network,
  Settings,
  PanelLeft,
  X,
} from "lucide-react";
import type { Studio } from "../studio";
import type { PageName } from "../navigation";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ModelStatus } from "./ModelStatus";
import { Sidebar } from "./Sidebar";
export const pages = [
  { id: "chat", label: "对话", icon: MessageSquare },
  { id: "knowledge", label: "知识", icon: BookOpen },
  { id: "graph", label: "图谱", icon: Network },
  { id: "settings", label: "设置", icon: Settings },
] as const;
export function AppShell({
  studio,
  page,
  openCreateWorkspace,
  children,
}: {
  studio: Studio;
  page: PageName;
  openCreateWorkspace: () => void;
  children: ReactNode;
}) {
  const drawer = useRef<HTMLDialogElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useEffect(() => {
    if (sidebarOpen) drawer.current?.showModal();
  }, [sidebarOpen]);
  return (
    <div className={page === "chat" ? "app-shell reference-chat" : "app-shell"}>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        跳到主要内容
      </a>
      {page === "chat" ? (
        <>
          <aside className="reference-sidebar">
            {!sidebarOpen && (
              <Sidebar
                studio={studio}
                openCreateWorkspace={openCreateWorkspace}
              />
            )}
          </aside>
          <TopBar studio={studio} onOpenSidebar={() => setSidebarOpen(true)} />
          <dialog
            onClose={() => setSidebarOpen(false)}
            ref={drawer}
            className="side-drawer reference-sidebar mobile-sidebar"
            aria-label="会话列表"
          >
            <button
              className="icon-button drawer-close"
              aria-label="关闭会话列表"
              onClick={() => drawer.current?.close()}
            >
              <X size={20} />
            </button>
            {sidebarOpen && (
              <Sidebar
                studio={studio}
                openCreateWorkspace={openCreateWorkspace}
                onSelect={() => drawer.current?.close()}
              />
            )}
          </dialog>
        </>
      ) : (
        <>
          <header className="app-header">
            <a className="brand" href="#/chat" aria-label="CortexOS 首页">
              <img src="/cortex.svg" width="30" height="30" alt="" />
              <span>CortexOS</span>
            </a>
            <WorkspaceSwitcher
              studio={studio}
              page={page}
              openCreateWorkspace={openCreateWorkspace}
            />
            <div className="header-status">
              <span className="preview-label">
                {studio.desktop ? "认知工作台 Alpha" : "界面预览"}
              </span>
              <ModelStatus studio={studio} />
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
        </>
      )}
      {children}
    </div>
  );
}
export function TopBar({
  studio,
  onOpenSidebar,
}: {
  studio: Studio;
  onOpenSidebar: () => void;
}) {
  return (
    <header className="reference-topbar">
      <button
        className="icon-button mobile-conversation-button"
        aria-label="打开会话列表"
        onClick={onOpenSidebar}
      >
        <PanelLeft size={20} />
      </button>
      <span className="topbar-label">
        {studio.desktop ? "本地认知工作台" : "界面预览"}
      </span>
      <ModelStatus studio={studio} />
    </header>
  );
}
