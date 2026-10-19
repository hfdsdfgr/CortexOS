import { Plus, MessageSquare, HardDrive } from "lucide-react";
import type { Studio } from "../studio";
import { navigate } from "../navigation";
export function ConversationList({
  studio,
  onSelect,
}: {
  studio: Studio;
  onSelect?: () => void;
}) {
  return (
    <>
      <div className="sidebar-heading">
        <h2>会话</h2>
        <span className="count">{studio.conversations.length}</span>
      </div>
      <button
        className="button secondary new-conversation"
        disabled={
          !studio.desktop ||
          !studio.workspaceId ||
          studio.loading ||
          studio.creatingConversation ||
          studio.sending
        }
        onClick={() => {
          void studio
            .newConversation()
            .then((conversation) => {
              navigate("chat", {
                workspace: conversation.workspaceId,
                conversation: conversation.id,
              });
              onSelect?.();
            })
            .catch(studio.reportError);
        }}
      >
        <Plus size={16} aria-hidden="true" />
        {studio.creatingConversation ? "正在创建…" : "新建对话"}
      </button>
      {studio.conversations.length ? (
        <ul className="conversation-list">
          {studio.conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                className="conversation-item"
                aria-current={
                  conversation.id === studio.conversationId ? "true" : undefined
                }
                title={conversation.title}
                onClick={() => {
                  void studio
                    .openConversation(conversation.workspaceId, conversation.id)
                    .then(() => {
                      navigate("chat", {
                        workspace: conversation.workspaceId,
                        conversation: conversation.id,
                      });
                      onSelect?.();
                    })
                    .catch(studio.reportError);
                }}
              >
                <MessageSquare size={15} aria-hidden="true" />
                <span>{conversation.title}</span>
                {studio.activeRun?.conversationId === conversation.id && (
                  <span className="running-mark" aria-label="生成中" />
                )}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="sidebar-empty">
          <MessageSquare size={22} aria-hidden="true" />
          <p>还没有会话</p>
        </div>
      )}
      <p className="sidebar-footer">
        <HardDrive size={14} aria-hidden="true" />
        {studio.desktop ? "会话自动保存在本机" : "浏览器仅供界面预览"}
      </p>
    </>
  );
}
