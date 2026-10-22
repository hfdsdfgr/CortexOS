import { SelectMenu } from "./SelectMenu";
import { Plus } from "lucide-react";
import { navigate, type PageName } from "../navigation";
import type { Studio } from "../studio";
export function WorkspaceSwitcher({
  studio,
  page,
  openCreateWorkspace,
}: {
  studio: Studio;
  page: PageName;
  openCreateWorkspace: () => void;
}) {
  return (
    <div className="workspace-picker">
      <label className="sr-only" htmlFor="current-workspace">
        当前工作区
      </label>
      <SelectMenu
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
      </SelectMenu>
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
  );
}
