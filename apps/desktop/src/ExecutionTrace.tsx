import { RetrievalSummary } from "./components/RetrievalSummary";
import { invoke } from "@tauri-apps/api/core";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { navigate, useNavigation } from "./navigation";
import { errorText, type RunSummary, type Studio } from "./studio";
import {
  projectExecution,
  runLabels,
  type ExecutionData,
  type ExecutionView,
} from "./execution-data";
import type { ViewportApi } from "./GraphViewport";
const Viewport = lazy(() => import("./GraphViewport"));
const sessionViews = new Map<string, ExecutionView>();

export function ExecutionTrace({ studio }: { studio: Studio }) {
  const route = useNavigation();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!studio.desktop || !studio.workspaceId) return;
    let current = true;
    setError(null);
    void invoke<RunSummary[]>("list_runs", {
      workspaceId: studio.workspaceId,
      offset,
    })
      .then((items) => {
        if (current) {
          setRuns((previous) =>
            offset
              ? [
                  ...previous,
                  ...items.filter(
                    (item) => !previous.some((p) => p.id === item.id),
                  ),
                ]
              : items,
          );
          setMore(items.length === 50);
        }
      })
      .catch((value) => {
        if (current) setError(errorText(value));
      });
    return () => {
      current = false;
    };
  }, [studio.desktop, studio.workspaceId, offset, refresh]);
  return (
    <>
      <div className="trace-toolbar">
        <label htmlFor="execution-run">运行</label>
        <select
          id="execution-run"
          value={route.run ?? ""}
          onChange={(e) =>
            navigate("graph", {
              workspace: studio.workspaceId,
              mode: "execution",
              run: e.target.value || null,
            })
          }
        >
          <option value="">选择一次真实运行</option>
          {route.run && !runs.some((run) => run.id === route.run) && (
            <option value={route.run}>当前定位的运行</option>
          )}
          {runs.map((run) => (
            <option key={run.id} value={run.id}>
              {new Date(run.startedAt).toLocaleString("zh-CN")} ·{" "}
              {runLabels[run.status] ?? run.status} · {run.modelId}
            </option>
          ))}
        </select>
        <button
          className="button text-button"
          onClick={() => {
            setOffset(0);
            setRefresh((x) => x + 1);
          }}
        >
          刷新运行
        </button>
        {more && (
          <button
            className="button text-button"
            onClick={() => setOffset(runs.length)}
          >
            加载更多
          </button>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!studio.desktop ? (
        <div className="graph-empty">
          <h2>在桌面程序中查看运行记录</h2>
          <p>执行过程记录实际应用事件，不代表模型的内部思维。</p>
        </div>
      ) : !route.run ? (
        <div className="graph-empty">
          <h2>{runs.length ? "选择要检查的运行" : "当前工作区尚无运行"}</h2>
          <a className="button secondary" href="#/chat">
            前往对话
          </a>
        </div>
      ) : (
        <TraceCanvas
          key={`${studio.workspaceId}:${route.run}`}
          studio={studio}
          runId={route.run}
        />
      )}
    </>
  );
}
function TraceCanvas({ studio, runId }: { studio: Studio; runId: string }) {
  const route = useNavigation();
  const workspaceId = studio.workspaceId!;
  const key = `${workspaceId}:${runId}`;
  const [data, setData] = useState<ExecutionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => {
    setReady(true);
    if (initial.current?.revision === 0 && !sessionViews.has(key))
      api.current?.fit();
  }, [key]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(sessionViews.has(key));
  const initial = useRef<ExecutionView | null>(sessionViews.get(key) ?? null);
  const revision = useRef(0);
  const api = useRef<ViewportApi>(null);
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const next = await invoke<ExecutionData>("load_execution_graph", {
          workspaceId,
          runId,
        });
        if (!current) return;
        setData(next);
        setError(null);
        if (!initial.current) initial.current = next.view;
        if (!sessionViews.has(key)) revision.current = next.view.revision;
        else revision.current = sessionViews.get(key)!.revision;
        if (next.detail.run.status === "running")
          timer = setTimeout(load, 1000);
      } catch (value) {
        if (current) setError(errorText(value));
      }
    };
    void load();
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [workspaceId, runId, refresh, key]);
  const graph = useMemo(() => (data ? projectExecution(data) : null), [data]);
  const select = (id: string) =>
    navigate("graph", {
      workspace: workspaceId,
      mode: "execution",
      run: runId,
      event: id,
    });
  const changed = useCallback(() => {
    const capture = api.current?.capture();
    if (capture) {
      sessionViews.set(key, { ...capture, revision: revision.current });
      setDirty(true);
    }
  }, [key]);
  const failure = useCallback(() => {
    setFailed(true);
    setReady(false);
  }, []);
  const selected = graph?.nodes.find((node) => node.id === route.event);
  const related =
    graph?.edges.filter(
      (edge) =>
        edge.fromNodeId === selected?.id || edge.toNodeId === selected?.id,
    ) ?? [];
  const save = async () => {
    const capture = api.current?.capture();
    if (!capture) return;
    setSaving(true);
    setError(null);
    try {
      revision.current = await invoke<number>("save_execution_view", {
        input: {
          workspaceId,
          runId,
          expectedRevision: revision.current,
          ...capture,
        },
      });
      sessionViews.delete(key);
      setDirty(false);
    } catch (value) {
      setError(errorText(value));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error}{" "}
          <button
            className="button text-button"
            onClick={() => setRefresh((x) => x + 1)}
          >
            重新读取运行
          </button>
          <button
            className="button text-button"
            onClick={() => {
              void invoke<ExecutionData>("load_execution_graph", {
                workspaceId,
                runId,
              })
                .then((next) => {
                  revision.current = next.view.revision;
                  initial.current = next.view;
                  api.current?.restore(next.view.camera, next.view.target);
                  sessionViews.delete(key);
                  setDirty(false);
                  setError(null);
                })
                .catch((value) => setError(errorText(value)));
            }}
          >
            恢复已保存视角
          </button>
        </p>
      )}
      {!data || !graph ? (
        <p role="status">正在读取执行记录…</p>
      ) : (
        <>
          <div className="trace-heading">
            <strong>
              {runLabels[data.detail.run.status] ?? data.detail.run.status} ·{" "}
              {data.detail.run.modelId}
            </strong>
            <span>
              {new Date(data.detail.run.startedAt).toLocaleString("zh-CN")}
            </span>
            <button
              className="button text-button"
              onClick={() =>
                navigate("chat", {
                  workspace: workspaceId,
                  conversation: data.detail.run.conversationId,
                  message: data.output.id,
                  back: route.hash,
                })
              }
            >
              定位回答
            </button>
          </div>
          <div className="trace-toolbar">
            <button
              className="button secondary"
              disabled={failed || !ready}
              onClick={() => api.current?.fit()}
            >
              适应执行图
            </button>
            <button
              className="button secondary"
              disabled={!selected || failed || !ready}
              onClick={() =>
                selected && api.current?.focus(graph.positions[selected.id])
              }
            >
              聚焦节点
            </button>
            <button
              className="button secondary"
              disabled={!dirty || failed || saving}
              onClick={() => void save()}
            >
              {saving ? "保存中…" : "保存执行视角"}
            </button>
            <span role="status">
              {dirty ? "视角未保存" : "视角已保存或使用默认视角"}
            </span>
          </div>
          <div className="trace-workbench">
            <section className="trace-index" aria-label="执行节点列表">
              <h2>实际事件与输入输出</h2>
              {graph.nodes.map((node) => (
                <button
                  key={node.id}
                  className="trace-node"
                  aria-current={selected?.id === node.id ? "true" : undefined}
                  onClick={() => select(node.id)}
                >
                  {node.seq !== undefined && (
                    <span>{node.seq.toString().padStart(2, "0")} </span>
                  )}
                  {node.title}
                </button>
              ))}
            </section>
            <div className="trace-canvas">
              {failed ? (
                <div className="graph-empty">
                  <h2>3D 不可用</h2>
                  <p>继续使用左侧节点列表与详情查看本次记录。</p>
                  <button
                    className="button secondary"
                    onClick={() => setFailed(false)}
                  >
                    重试 3D
                  </button>
                </div>
              ) : (
                <Suspense fallback={<p>正在加载执行画布…</p>}>
                  <Viewport
                    label="3D 执行画布"
                    nodes={graph.nodes}
                    edges={graph.edges}
                    positions={graph.positions}
                    selected={selected?.id ?? null}
                    camera={initial.current!.camera}
                    target={initial.current!.target}
                    apiRef={api}
                    onSelect={select}
                    onChange={changed}
                    onFailure={failure}
                    onReady={onReady}
                  />
                </Suspense>
              )}
            </div>
            <section className="trace-detail" aria-label="执行节点详情">
              {selected ? (
                <>
                  <h2>{selected.title}</h2>
                  {selected.time && (
                    <p>
                      {new Date(selected.time).toLocaleString("zh-CN")} ·
                      记录时间
                    </p>
                  )}
                  {selected.seq !== undefined ? (
                    <>
                      <p>{selected.summary}</p>
                      {data.detail.events.find(
                        (event) => event.seq === selected.seq,
                      )?.kind === "retrieval_completed" && (
                        <RetrievalSummary
                          report={data.detail.contextManifest.retrieval}
                        />
                      )}
                      <details>
                        <summary>审计数据</summary>
                        <pre>{selected.content}</pre>
                      </details>
                    </>
                  ) : (
                    <p className="context-content">{selected.content}</p>
                  )}
                  {selected.nodeId && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        navigate("knowledge", {
                          workspace: workspaceId,
                          node: selected.nodeId,
                          version: selected.version,
                          back: route.hash,
                        })
                      }
                    >
                      查看知识 v{selected.version}
                    </button>
                  )}
                  {selected.messageId && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        navigate("chat", {
                          workspace: workspaceId,
                          conversation: data.detail.run.conversationId,
                          message: selected.messageId,
                          back: route.hash,
                        })
                      }
                    >
                      定位原消息
                    </button>
                  )}
                  {related.length > 0 && (
                    <>
                      <h3>关系解释</h3>
                      <ul>
                        {related.map((edge) => (
                          <li key={edge.id}>
                            <button
                              className="button text-button"
                              onClick={() =>
                                select(
                                  edge.fromNodeId === selected.id
                                    ? edge.toNodeId
                                    : edge.fromNodeId,
                                )
                              }
                            >
                              {
                                graph.nodes.find(
                                  (n) => n.id === edge.fromNodeId,
                                )?.title
                              }{" "}
                              →{" "}
                              {
                                graph.nodes.find((n) => n.id === edge.toNodeId)
                                  ?.title
                              }
                            </button>
                            <p>
                              {edge.relation === "executed_before"
                                ? "事件先后顺序，不表示因果关系。"
                                : edge.relation === "included_in_context"
                                  ? "这项资料纳入了本次请求上下文，不代表已验证。"
                                  : "本次结束记录关联的已保存输出。"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {selected.hash && (
                    <details>
                      <summary>内容哈希</summary>
                      <code>{selected.hash}</code>
                    </details>
                  )}
                </>
              ) : (
                <p>
                  {route.event
                    ? "该节点不在本次运行记录中。"
                    : "选择节点，检查实际事件、依据或输出。"}
                </p>
              )}
              <details className="trace-run-info">
                <summary>本次运行与模型配置</summary>
                <p>
                  上下文 {data.detail.settings.numCtx} · 输出{" "}
                  {data.detail.settings.numPredict} · 温度{" "}
                  {data.detail.settings.temperature}
                </p>
                <p>
                  {data.detail.snapshot
                    ? "包含完整请求快照"
                    : "旧运行未保存完整快照；仅展示已有事件与输出。"}
                </p>
                <code>{runId}</code>
              </details>
            </section>
          </div>
          <p className="trace-caption">
            时间轴按记录顺序排列；上层为本次输入资料，下层为输出。执行过程不代表模型内部思维。
          </p>
        </>
      )}
    </>
  );
}
