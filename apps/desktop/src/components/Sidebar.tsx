import { BookOpen, MessageSquare, Network, Settings } from "lucide-react";
import type { Studio } from "../studio";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ConversationList } from "./ConversationList";
export function Sidebar({
  studio,
  openCreateWorkspace,
  onSelect,
}: {
  studio: Studio;
  openCreateWorkspace: () => void;
  onSelect?: () => void;
}) {
  return (
    <>
      <a
        className="reference-brand"
        href="#/chat"
        aria-label="CortexOS 首页"
        onClick={onSelect}
      >
        <span className="brand-glyph">C</span>CortexOS
      </a>
      <nav className="reference-navigation" aria-label="主导航">
        <a href="#/chat" aria-current="page" onClick={onSelect}>
          <MessageSquare size={19} />
          对话
        </a>
        <a href="#/knowledge" onClick={onSelect}>
          <BookOpen size={19} />
          知识
        </a>
        <a href="#/graph" onClick={onSelect}>
          <Network size={19} />
          图谱
        </a>
        <a href="#/settings" onClick={onSelect}>
          <Settings size={19} />
          设置
        </a>
      </nav>
      <div className="workspace-group">
        <h2>工作区</h2>
        <WorkspaceSwitcher
          studio={studio}
          page="chat"
          openCreateWorkspace={() => {
            onSelect?.();
            openCreateWorkspace();
          }}
        />
      </div>
      <div className="reference-conversations">
        <ConversationList studio={studio} onSelect={onSelect} />
      </div>
      <div className="sidebar-identity">
        <span className="identity-mark">C</span>
        <div>
          CortexOS<span>本地认知工作台</span>
        </div>
      </div>
    </>
  );
}
