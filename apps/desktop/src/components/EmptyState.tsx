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
          <defs>
            <pattern
              id="mark-dots"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="3" cy="3" r="1.8" fill="currentColor" />
            </pattern>
          </defs>
          <path
            d="M40 2 49 27 73 14 57 37 79 48 53 50 59 76 40 57 19 78 26 51 1 43 27 33 14 8 36 25Z"
            fill="url(#mark-dots)"
          />
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
