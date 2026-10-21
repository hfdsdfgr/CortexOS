import { useRef, useState, type ReactNode } from "react";
import { PanelLeft, X } from "lucide-react";
import type { Studio } from "../studio";
import type { PageName } from "../navigation";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ModelStatus } from "./ModelStatus";
import { ConversationList } from "./ConversationList";
import { NavigationIcon } from "./NavigationIcon";
import { WindowControls, WindowDragRegion } from "./WindowControls";
export const pages = [
  { id: "chat", label: "对话" },
  { id: "knowledge", label: "知识" },
  { id: "graph", label: "图谱" },
  { id: "settings", label: "设置" },
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
  const [expanded, setExpanded] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const drawer = useRef<HTMLDialogElement>(null);
  return (
    <div
      className={`app-shell reference-chat compact-shell design-v3 ${page === "knowledge" ? "reference-knowledge" : ""} ${page === "chat" ? "with-conversations" : ""} ${expanded ? "navigation-expanded" : ""}`}
    >
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
      <aside className="global-rail">
        <a className="rail-brand" href="#/chat" aria-label="CortexOS 首页">
          <span className="brand-glyph">C</span>
          {expanded && <strong>CortexOS</strong>}
        </a>
        <button
          className="rail-toggle"
          aria-label={expanded ? "收起全局导航" : "展开全局导航"}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          title={expanded ? "收起导航" : "展开导航"}
        >
          <PanelLeft size={20} />
          {expanded && <span>收起导航</span>}
        </button>
        <nav aria-label="主导航">
          {pages.map(({ id, label }) => (
            <a
              key={id}
              href={`#/${id}`}
              aria-label={label}
              aria-current={page === id ? "page" : undefined}
              className="rail-link"
              title={label}
            >
              <NavigationIcon page={id} />
              <span className={expanded ? "rail-label" : "rail-caption"}>
                {label}
              </span>
            </a>
          ))}
        </nav>
      </aside>
      <header className="reference-topbar">
        {page === "chat" && (
          <button
            className="icon-button mobile-conversation-button"
            aria-label="打开会话列表"
            onClick={() => {
              setConversationOpen(true);
              drawer.current?.showModal();
            }}
          >
            <PanelLeft size={20} />
          </button>
        )}
        <WorkspaceSwitcher
          studio={studio}
          page={page}
          openCreateWorkspace={openCreateWorkspace}
        />
        {studio.desktop && <WindowDragRegion onError={studio.reportError} />}
        <ModelStatus studio={studio} />
        {studio.desktop && <WindowControls onError={studio.reportError} />}
      </header>
      {page === "chat" && (
        <>
          <aside className="reference-sidebar conversation-pane">
            {!conversationOpen && <ConversationList studio={studio} />}
          </aside>
          <dialog
            ref={drawer}
            className="side-drawer reference-sidebar mobile-sidebar"
            aria-label="会话列表"
            onClose={() => setConversationOpen(false)}
          >
            <button
              className="icon-button drawer-close"
              aria-label="关闭会话列表"
              onClick={() => drawer.current?.close()}
            >
              <X size={20} />
            </button>
            {conversationOpen && (
              <ConversationList
                studio={studio}
                onSelect={() => drawer.current?.close()}
              />
            )}
          </dialog>
        </>
      )}
      {children}
    </div>
  );
}
