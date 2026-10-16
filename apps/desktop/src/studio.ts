import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ModelSettings {
  model: string;
  numCtx: number;
  temperature: number;
  numPredict: number;
  timeoutSeconds: number;
}
export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}
export interface Conversation {
  id: string;
  workspaceId: string;
  title: string;
  updatedAt: string;
}
export interface Message {
  id: string;
  workspaceId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  status: string;
  modelRunId: string | null;
  finishReason: string | null;
  createdAt: string;
}
export interface RunSummary {
  id: string;
  workspaceId: string;
  conversationId: string;
  assistantMessageId: string;
  modelId: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}
export interface RunDetail {
  run: RunSummary;
  settings: ModelSettings;
  contextManifest: {
    strategy: string;
    estimatedUnits: number;
    budgetUnits: number;
    estimateNote: string;
    messageRefs: { messageId: string; contentHash: string }[];
    retrievalUsed: boolean;
  };
  events: { seq: number; kind: string; occurredAt: string; payload: unknown }[];
}
export interface Bootstrap {
  workspaces: Workspace[];
  settings: ModelSettings;
  activeRun: RunSummary | null;
  dataPath: string;
}
export interface ModelHealth {
  version: string;
  models: {
    name: string;
    size: number;
    parameterSize: string | null;
    quantization: string | null;
  }[];
}
interface StreamUpdate {
  workspaceId: string;
  conversationId: string;
  runId: string;
  messageId: string;
  seq: number;
  content: string;
  status: string;
  errorMessage: string | null;
}

export const defaultSettings: ModelSettings = {
  model: "qwen3:4b-instruct",
  numCtx: 4096,
  temperature: 0.3,
  numPredict: 512,
  timeoutSeconds: 180,
};
export const desktop = isTauri();
export function errorText(value: unknown): string {
  return typeof value === "string"
    ? value
    : value instanceof Error
      ? value.message
      : "操作未完成，请重试。";
}
function preference(key: string): string | null {
  try {
    return localStorage.getItem(`cortexos.${key}`);
  } catch {
    return null;
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(`cortexos.${key}`, value);
  } catch {
    /* Optional view preference; domain data stays in SQLite. */
  }
}

export function useStudio() {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [settingsDraft, setSettingsDraft] = useState(defaultSettings);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [storedMessages, setMessages] = useState<Message[]>([]);
  const [updates, setUpdates] = useState<Record<string, StreamUpdate>>({});
  const [activeRun, setActiveRun] = useState<RunSummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [health, setHealth] = useState<ModelHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(desktop);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const view = useRef({ workspaceId, conversationId });
  view.current = { workspaceId, conversationId };
  const viewVersion = useRef(0);
  const pendingSend = useRef(false);
  const finishedRuns = useRef(new Set<string>());
  const channel = useRef<Channel<StreamUpdate> | null>(null);
  const reportError = useCallback(
    (value: unknown) => setError(errorText(value)),
    [],
  );

  const refreshMessages = useCallback(
    async (workspace: string, conversation: string) => {
      const messages = await invoke<Message[]>("load_messages", {
        workspaceId: workspace,
        conversationId: conversation,
      });
      if (
        view.current.workspaceId === workspace &&
        view.current.conversationId === conversation
      ) {
        setMessages(messages);
        setUpdates((previous) => {
          const next = { ...previous };
          for (const message of messages)
            if (
              message.status !== "streaming" &&
              next[message.id]?.content === message.content
            )
              delete next[message.id];
          return next;
        });
      }
    },
    [],
  );

  const refreshConversations = useCallback(async (workspace: string) => {
    const list = await invoke<Conversation[]>("list_conversations", {
      workspaceId: workspace,
    });
    if (view.current.workspaceId === workspace) setConversations(list);
    return list;
  }, []);

  const openConversation = useCallback(
    async (workspace: string, conversation: string) => {
      const version = ++viewVersion.current;
      view.current = { workspaceId: workspace, conversationId: conversation };
      setConversationId(conversation);
      setMessages([]);
      setLoadingMessages(true);
      remember(`conversation.${workspace}`, conversation);
      try {
        const messages = await invoke<Message[]>("load_messages", {
          workspaceId: workspace,
          conversationId: conversation,
        });
        if (version === viewVersion.current) setMessages(messages);
      } finally {
        if (version === viewVersion.current) setLoadingMessages(false);
      }
    },
    [],
  );

  const openWorkspace = useCallback(
    async (workspace: string) => {
      const version = ++viewVersion.current;
      view.current = { workspaceId: workspace, conversationId: null };
      setWorkspaceId(workspace);
      setConversationId(null);
      setConversations([]);
      setMessages([]);
      remember("workspace", workspace);
      const list = await invoke<Conversation[]>("list_conversations", {
        workspaceId: workspace,
      });
      if (version !== viewVersion.current) return;
      setConversations(list);
      const saved = preference(`conversation.${workspace}`);
      const first = list.find((item) => item.id === saved) ?? list[0];
      if (first) await openConversation(workspace, first.id);
    },
    [openConversation],
  );

  const reload = useCallback(async () => {
    if (!desktop) return;
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<Bootstrap>("bootstrap");
      setData(result);
      setSettings(result.settings);
      setSettingsDraft(result.settings);
      setActiveRun(result.activeRun);
      const saved = preference("workspace");
      const first =
        result.workspaces.find((item) => item.id === saved) ??
        result.workspaces[0];
      if (first) await openWorkspace(first.id);
    } catch (value) {
      reportError(value);
    } finally {
      setLoading(false);
    }
  }, [openWorkspace, reportError]);

  const checkConnection = useCallback(async () => {
    if (!desktop) return;
    setChecking(true);
    setConnectionError(null);
    try {
      setHealth(await invoke<ModelHealth>("check_ollama"));
    } catch (value) {
      setHealth(null);
      setConnectionError(errorText(value));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    void checkConnection();
  }, [reload, checkConnection]);

  useEffect(() => {
    if (!activeRun) return;
    let pending = false;
    const timer = window.setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const detail = await invoke<RunDetail>("get_run", {
          workspaceId: activeRun.workspaceId,
          runId: activeRun.id,
        });
        if (detail.run.status !== "running")
          setActiveRun((current) =>
            current?.id === activeRun.id ? null : current,
          );
        await refreshMessages(activeRun.workspaceId, activeRun.conversationId);
        if (detail.run.status !== "running")
          await refreshConversations(activeRun.workspaceId);
      } catch (value) {
        reportError(value);
      } finally {
        pending = false;
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeRun, refreshMessages, refreshConversations, reportError]);

  const createWorkspace = async (name: string) => {
    const workspace = await invoke<Workspace>("create_workspace", { name });
    setData((current) =>
      current
        ? { ...current, workspaces: [...current.workspaces, workspace] }
        : current,
    );
    await openWorkspace(workspace.id);
  };

  const newConversation = async () => {
    const workspace = view.current.workspaceId;
    if (!workspace) throw "请先创建工作区。";
    setCreatingConversation(true);
    try {
      const conversation = await invoke<Conversation>("create_conversation", {
        workspaceId: workspace,
      });
      await refreshConversations(workspace);
      if (view.current.workspaceId === workspace)
        await openConversation(workspace, conversation.id);
      return conversation;
    } finally {
      setCreatingConversation(false);
    }
  };

  const renameConversation = async (title: string) => {
    const { workspaceId: workspace, conversationId: conversation } =
      view.current;
    if (!workspace || !conversation) return;
    await invoke("rename_conversation", {
      workspaceId: workspace,
      conversationId: conversation,
      title,
    });
    await refreshConversations(workspace);
  };

  const draftKey = `${workspaceId}:${conversationId ?? "new"}`;
  const draft = drafts[draftKey] ?? "";
  const setDraft = (text: string) =>
    setDrafts((current) => ({ ...current, [draftKey]: text }));

  const send = async (override?: string) => {
    const workspace = view.current.workspaceId;
    const content = (override ?? draft).trim();
    if (!workspace || !content || activeRun || pendingSend.current) return;
    pendingSend.current = true;
    setSending(true);
    setError(null);
    let conversation = view.current.conversationId;
    try {
      conversation = conversation ?? (await newConversation()).id;
      if (override === undefined)
        setDrafts((current) => ({
          ...current,
          [`${workspace}:${conversation}`]: content,
        }));
      const stream = new Channel<StreamUpdate>();
      channel.current = stream;
      stream.onmessage = (update) => {
        setUpdates((previous) => {
          if ((previous[update.messageId]?.seq ?? 0) >= update.seq)
            return previous;
          return { ...previous, [update.messageId]: update };
        });
        if (update.status !== "running") {
          finishedRuns.current.add(update.runId);
          setActiveRun((current) =>
            current?.id === update.runId ? null : current,
          );
          if (update.errorMessage) reportError(update.errorMessage);
          void refreshMessages(update.workspaceId, update.conversationId).catch(
            reportError,
          );
          void refreshConversations(update.workspaceId).catch(reportError);
        }
      };
      const run = await invoke<RunSummary>("start_chat", {
        workspaceId: workspace,
        conversationId: conversation,
        content,
        onUpdate: stream,
      });
      if (!finishedRuns.current.has(run.id)) setActiveRun(run);
      if (override === undefined)
        setDrafts((current) => ({
          ...current,
          [draftKey]: "",
          [`${workspace}:${conversation}`]: "",
        }));
      await refreshMessages(workspace, conversation);
      await refreshConversations(workspace);
    } catch (value) {
      reportError(value);
    } finally {
      pendingSend.current = false;
      setSending(false);
    }
  };

  const cancel = async () => {
    if (!activeRun) return;
    await invoke("cancel_run", {
      workspaceId: activeRun.workspaceId,
      runId: activeRun.id,
    });
  };
  const saveSettings = async (next: ModelSettings) => {
    const saved = await invoke<ModelSettings>("save_settings", {
      settings: next,
    });
    setSettings(saved);
    setSettingsDraft(saved);
  };
  const messages = storedMessages.map((message) => {
    const update = updates[message.id];
    return update
      ? {
          ...message,
          content: update.content,
          status: update.status === "running" ? "streaming" : update.status,
        }
      : message;
  });
  const getRun = useCallback(
    (runId: string) =>
      invoke<RunDetail>("get_run", {
        workspaceId: view.current.workspaceId,
        runId,
      }),
    [],
  );

  return {
    desktop,
    data,
    settings,
    settingsDraft,
    setSettingsDraft,
    workspaceId,
    conversationId,
    conversations,
    messages,
    activeRun,
    draft,
    setDraft,
    health,
    checking,
    connectionError,
    error,
    loading,
    loadingMessages,
    sending,
    creatingConversation,
    reload,
    createWorkspace,
    openWorkspace,
    openConversation,
    newConversation,
    renameConversation,
    checkConnection,
    send,
    cancel,
    saveSettings,
    reportError,
    clearError: () => setError(null),
    getRun,
  };
}

export type Studio = ReturnType<typeof useStudio>;
