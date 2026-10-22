import { Plus } from "lucide-react";
import type { Studio } from "../studio";
export function EmptyState({
  studio,
  modelReady,
  onCreateWorkspace,
}: {
  studio: Studio;
  modelReady: boolean | undefined;
  onCreateWorkspace: () => void;
}) {
  return (
    <div className="chat-empty">
      <div className="welcome-heading">
        <svg className="cognitive-mark" viewBox="0 0 80 80" aria-hidden="true">
          <circle cx="40" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="40" cy="40" r="11" fill="currentColor" />
          <circle cx="58" cy="23" r="6" fill="var(--success)" />
        </svg>
        <h2>欢迎使用 CortexOS</h2>
      </div>
      <div className="welcome-next">
        {!studio.desktop ? (
          <p>在桌面程序中开始，浏览器仅供界面预览。</p>
        ) : !studio.workspaceId ? (
          <button
            className="button secondary"
            disabled={!studio.data || studio.loading}
            onClick={onCreateWorkspace}
          >
            <Plus size={16} aria-hidden="true" />
            创建工作区
          </button>
        ) : !modelReady ? (
          <a className="button secondary" href="#/settings">
            连接本地模型，开始讨论
          </a>
        ) : null}
      </div>
    </div>
  );
}
