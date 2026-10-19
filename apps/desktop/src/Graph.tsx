import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  BookOpen,
  Focus,
  GitBranch,
  List,
  Network,
  Plus,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { KnowledgeInspector, kinds, type EditKnowledge } from "./Knowledge";
import { navigate, useNavigation } from "./navigation";
import { ExecutionTrace } from "./ExecutionTrace";
import { errorText, type Studio } from "./studio";
import {
  defaultPositions,
  demoContents,
  demoGraph,
  relations,
  shapes,
  type GraphData,
  type GraphEdge,
  type Point,
} from "./graph-data";
import type { ViewportApi } from "./GraphViewport";

const Viewport = lazy(() => import("./GraphViewport"));
export interface EditEdge {
  workspaceId: string;
  graph: GraphData;
  selected: string;
  edge?: GraphEdge;
}

export function GraphPage({
  studio,
  revision,
  onEdit,
  onEditEdge,
}: {
  studio: Studio;
  revision: number;
  onEdit: (request: EditKnowledge) => void;
  onEditEdge: (request: EditEdge) => void;
}) {
  const route = useNavigation();
  const kind = route.mode;
  const setKind = (mode: string) =>
    navigate("graph", { workspace: studio.workspaceId, mode });
  const [demo, setDemo] = useState(!studio.desktop);
  return (
    <section className="standard-page graph-page" aria-labelledby="page-title">
      <header className="page-heading">
        <h1 id="page-title">图谱</h1>
        <fieldset className="segmented-control">
          <legend className="sr-only">图谱类型</legend>
          <label>
            <input
              type="radio"
              name="graph"
              checked={kind === "knowledge"}
              onChange={() => setKind("knowledge")}
            />
            <BookOpen size={15} />
            知识关系
          </label>
          <label>
            <input
              type="radio"
              name="graph"
              checked={kind === "execution"}
              onChange={() => setKind("execution")}
            />
            <GitBranch size={15} />
            执行过程
          </label>
        </fieldset>
      </header>
      {kind === "knowledge" ? (
        <>
          <div className="graph-source">
            <label htmlFor="graph-source">数据</label>
            <select
              id="graph-source"
              value={demo ? "demo" : "workspace"}
              onChange={(event) => setDemo(event.target.value === "demo")}
            >
              <option value="workspace">当前工作区</option>
              <option value="demo">7 节点演示</option>
            </select>
            {demo && <strong>演示数据 · 不写入工作区</strong>}
          </div>
          <KnowledgeGraph
            key={`${studio.workspaceId}:${demo}`}
            studio={studio}
            revision={revision}
            demo={demo}
            onEdit={onEdit}
            onEditEdge={onEditEdge}
          />
        </>
      ) : (
        <ExecutionTrace key={studio.workspaceId ?? "preview"} studio={studio} />
      )}
    </section>
  );
}
function KnowledgeGraph({
  studio,
  revision,
  demo,
  onEdit,
  onEditEdge,
}: {
  studio: Studio;
  revision: number;
  demo: boolean;
  onEdit: (request: EditKnowledge) => void;
  onEditEdge: (request: EditEdge) => void;
}) {
  const route = useNavigation();
  const workspace = studio.workspaceId;
  const [graph, setGraph] = useState<GraphData | null>(demo ? demoGraph : null);
  const [positions, setPositions] = useState<Record<string, Point>>(
    demo ? defaultPositions(demoGraph.nodes) : {},
  );
  const [selected, setSelected] = useState<string | null>(route.node);
  useEffect(() => {
    if (!demo) setSelected(route.node);
  }, [route.node, demo]);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [since, setSince] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialView = useRef<GraphData["view"] | null>(
    demo ? demoGraph.view : null,
  );
  const viewVersion = useRef(0);
  const api = useRef<ViewportApi>(null);
  const onFailure = useCallback(() => setFailed(true), []);
  const viewChanged = useCallback(() => {
    setUnsaved(true);
    setSaved(false);
  }, []);
  useEffect(() => {
    if (demo || !workspace || !studio.desktop) return;
    let current = true;
    setLoading(true);
    setError(null);
    void invoke<GraphData>("load_knowledge_graph", { workspaceId: workspace })
      .then((data) => {
        if (!current) return;
        setGraph(data);
        setPositions((previous) => ({
          ...defaultPositions(data.nodes),
          ...Object.fromEntries(
            data.view.positions.map((item) => [item.nodeId, item.position]),
          ),
          ...previous,
        }));
        if (!initialView.current) {
          initialView.current = data.view;
          viewVersion.current = data.view.revision;
          setUnsaved(data.view.revision === 0 && data.nodes.length > 0);
        }
      })
      .catch((e) => {
        if (current) setError(errorText(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [workspace, studio.desktop, demo, revision, refresh]);
  const visible =
    graph?.nodes.filter(
      (node) =>
        node.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
        (typeFilter === "all" || node.kind === typeFilter) &&
        (statusFilter === "all" ||
          (statusFilter === "confirmed"
            ? node.latestVersion === node.effectiveVersion
            : node.latestVersion !== node.effectiveVersion)) &&
        (!since ||
          new Date(node.updatedAt).toLocaleDateString("en-CA") >= since),
    ) ?? [];
  const visibleIds = new Set(visible.map((node) => node.id));
  const visibleEdges =
    graph?.edges.filter(
      (edge) =>
        edge.versions[0].active &&
        visibleIds.has(edge.versions[0].fromNodeId) &&
        visibleIds.has(edge.versions[0].toNodeId),
    ) ?? [];
  const selectedNode = graph?.nodes.find((node) => node.id === selected);
  const currentEdges =
    graph?.edges.filter(
      (edge) =>
        edge.versions[0].fromNodeId === selected ||
        edge.versions[0].toNodeId === selected,
    ) ?? [];
  const select = (id: string) => {
    setSelected(id);
    if (!demo)
      navigate("graph", {
        workspace,
        mode: "knowledge",
        node: id,
        back: route.back,
      });
    setListOpen(false);
  };
  const focusSelected = () => {
    if (selected && positions[selected])
      api.current?.focus(positions[selected]);
  };
  const saveView = async () => {
    const view = api.current?.capture() ?? initialView.current;
    if (!view || !graph || !workspace) return;
    setSaving(true);
    setError(null);
    try {
      const next = await invoke<number>("save_graph_view", {
        input: {
          workspaceId: workspace,
          expectedRevision: viewVersion.current,
          camera: view.camera,
          target: view.target,
          positions: graph.nodes.map((node) => ({
            nodeId: node.id,
            position: positions[node.id],
          })),
        },
      });
      viewVersion.current = next;
      setUnsaved(false);
      setSaved(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const reloadView = async () => {
    if (!workspace || saving) return;
    setLoading(true);
    try {
      const data = await invoke<GraphData>("load_knowledge_graph", {
        workspaceId: workspace,
      });
      setGraph(data);
      setPositions({
        ...defaultPositions(data.nodes),
        ...Object.fromEntries(
          data.view.positions.map((item) => [item.nodeId, item.position]),
        ),
      });
      initialView.current = data.view;
      viewVersion.current = data.view.revision;
      api.current?.restore(data.view.camera, data.view.target);
      setError(null);
      setUnsaved(false);
      setSaved(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  };
  if (!demo && (!studio.desktop || !workspace))
    return (
      <div className="graph-empty">
        <Network size={32} />
        <h2>
          {studio.desktop ? "先选择一个工作区" : "在桌面程序中查看项目图谱"}
        </h2>
        <p>可切换到 7 节点演示体验操作。</p>
      </div>
    );
  return (
    <>
      <div className="graph-tools">
        <button
          className="button secondary graph-list-toggle"
          aria-pressed={listOpen}
          onClick={() => setListOpen(!listOpen)}
        >
          <List size={16} />
          节点列表
        </button>
        <input
          aria-label="搜索图谱节点"
          placeholder="搜索节点"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="节点类型筛选"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">全部类型</option>
          {Object.entries(kinds).map(([value, name]) => (
            <option key={value} value={value}>
              {name}
            </option>
          ))}
        </select>
        <select
          aria-label="节点审核筛选"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="confirmed">已确认</option>
          <option value="draft">待确认 / 新草案</option>
        </select>
        <details className="graph-more-filters">
          <summary>时间</summary>
          <label>
            更新日期不早于
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
        </details>
        <span className="graph-visible-count" role="status">
          {visible.length} / {graph?.nodes.length ?? 0} 节点
        </span>
        <div className="graph-view-actions">
          <button
            className="icon-button"
            title="适应全部节点"
            aria-label="适应全部节点"
            disabled={failed || !visible.length || saving}
            onClick={() => api.current?.fit()}
          >
            <Focus size={18} />
          </button>
          <button
            className="icon-button"
            title="重置布局与视角"
            aria-label="重置布局与视角"
            disabled={!graph?.nodes.length || saving}
            onClick={() => {
              if (graph) setPositions(defaultPositions(graph.nodes));
              api.current?.reset();
              viewChanged();
            }}
          >
            <RotateCcw size={17} />
          </button>
          {!demo && (
            <button
              className="button primary"
              disabled={!graph?.nodes.length || saving || !unsaved}
              onClick={() => {
                void saveView();
              }}
            >
              <Save size={15} />
              {saving ? "保存中…" : "保存视图"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="button text-button"
            onClick={() => {
              void reloadView();
            }}
          >
            恢复已保存视图
          </button>
        </div>
      )}
      <div
        className={`graph-workbench ${selectedNode ? "has-inspector" : ""} ${listOpen ? "list-is-open" : ""} ${saving ? "is-saving" : ""}`}
      >
        <aside
          className={`graph-node-index ${failed ? "fallback-list" : ""}`}
          aria-label="图谱节点列表"
        >
          <h2>节点</h2>
          {loading && <p role="status">正在读取图谱…</p>}
          <ul>
            {visible.map((node) => (
              <li key={node.id}>
                <button
                  className="graph-node-row"
                  aria-current={selected === node.id ? "true" : undefined}
                  onClick={() => select(node.id)}
                >
                  <i
                    className={`node-key node-${node.kind}`}
                    aria-hidden="true"
                  />
                  <span>
                    {node.title}
                    <small>
                      {kinds[node.kind]} ·{" "}
                      {node.latestVersion === node.effectiveVersion
                        ? "已确认"
                        : "草案"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!visible.length && (
            <p className="small-note">
              {graph?.nodes.length ? "没有匹配节点。" : "暂无知识节点。"}
            </p>
          )}
          {(query ||
            typeFilter !== "all" ||
            statusFilter !== "all" ||
            since) && (
            <button
              className="button text-button"
              onClick={() => {
                setQuery("");
                setTypeFilter("all");
                setStatusFilter("all");
                setSince("");
              }}
            >
              清除筛选
            </button>
          )}
        </aside>
        <div className="graph-stage">
          {loading && !graph ? (
            <p className="inline-loading" role="status">
              正在准备画布…
            </p>
          ) : !graph?.nodes.length ? (
            <div className="graph-empty">
              <Network size={32} />
              <h2>从知识建立关系</h2>
              <p>先保存知识草案，再连接相关条目。</p>
              <a className="button primary" href="#/knowledge">
                前往知识
              </a>
            </div>
          ) : failed ? (
            <div className="graph-empty" role="status">
              <h2>3D 暂不可用</h2>
              <p>继续使用节点列表查看和编辑知识。</p>
              <button
                className="button secondary"
                onClick={() => {
                  setFailed(false);
                  setCanvasKey((n) => n + 1);
                }}
              >
                重试 3D
              </button>
            </div>
          ) : (
            <Suspense fallback={<p className="inline-loading">正在加载 3D…</p>}>
              <Viewport
                key={canvasKey}
                nodes={visible.map((node) => ({
                  ...node,
                  badge:
                    node.latestVersion !== node.effectiveVersion
                      ? "草案"
                      : undefined,
                }))}
                edges={visibleEdges.map((edge) => ({
                  id: edge.id,
                  ...edge.versions[0],
                }))}
                positions={positions}
                selected={visibleIds.has(selected ?? "") ? selected : null}
                camera={initialView.current?.camera ?? [0, 9, 22]}
                target={initialView.current?.target ?? [0, 0, 0]}
                apiRef={api}
                onSelect={select}
                onChange={viewChanged}
                onFailure={onFailure}
              />
            </Suspense>
          )}
          <details className="graph-legend">
            <summary>图例与操作</summary>
            <ul>
              {Object.entries(kinds).map(([key, name]) => (
                <li key={key}>
                  <i className={`node-key node-${key}`} />
                  {name}
                  <span>{shapes[key]}</span>
                </li>
              ))}
            </ul>
            <p>
              拖动旋转，右键拖动平移，滚轮缩放。可从列表选择，再点击“聚焦节点”。方向按“起点
              → 关系 → 终点”阅读。
            </p>
            <p>空间位置用于布局，不代表因果或可信程度。</p>
          </details>
          <div className="graph-view-status" role="status">
            {demo
              ? "演示视图"
              : saved
                ? "视图已保存"
                : unsaved
                  ? "视图未保存"
                  : "已载入保存视图"}
          </div>
        </div>
        {selectedNode && (
          <aside className="graph-inspector" aria-label="图谱检查器">
            <header className="graph-inspector-toolbar">
              <button
                className="button text-button"
                disabled={failed || !visibleIds.has(selectedNode.id)}
                onClick={focusSelected}
              >
                <Focus size={15} />
                聚焦节点
              </button>
              <button
                className="icon-button"
                aria-label="关闭图谱详情"
                onClick={() => {
                  setSelected(null);
                  if (!demo)
                    navigate("graph", { workspace, mode: "knowledge" });
                }}
              >
                <X size={19} />
              </button>
            </header>
            {!visibleIds.has(selectedNode.id) && (
              <p className="small-note">此节点被当前筛选隐藏，详情仍保留。</p>
            )}
            {demo ? (
              <div className="demo-inspector">
                <span className="knowledge-kind">
                  {kinds[selectedNode.kind]} / 演示节点
                </span>
                <h2>{selectedNode.title}</h2>
                <p>{demoContents[selectedNode.id]}</p>
                <p className="small-note">演示内容不可编辑，不写入工作区。</p>
              </div>
            ) : (
              <KnowledgeInspector
                studio={studio}
                workspace={workspace}
                selected={selected}
                requestedVersion={route.version}
                revision={revision + refresh}
                onBack={() => {
                  setSelected(null);
                  if (!demo)
                    navigate("graph", { workspace, mode: "knowledge" });
                }}
                onEdit={(request) => onEdit({ ...request, returnTo: "graph" })}
                onChanged={() => setRefresh((n) => n + 1)}
              />
            )}
            <section className="node-relations">
              <header>
                <h3>相关关系</h3>
                {!demo && (
                  <button
                    className="button text-button"
                    onClick={() =>
                      onEditEdge({
                        workspaceId: workspace!,
                        graph: graph!,
                        selected: selectedNode.id,
                      })
                    }
                  >
                    <Plus size={15} />
                    添加关系
                  </button>
                )}
              </header>
              {!currentEdges.length && (
                <p className="small-note">尚未建立关系。</p>
              )}
              {currentEdges.map((edge) => (
                <details key={edge.id} className="edge-details">
                  <summary>
                    {
                      graph?.nodes.find(
                        (node) => node.id === edge.versions[0].fromNodeId,
                      )?.title
                    }{" "}
                    → {relations[edge.versions[0].relation]} →{" "}
                    {
                      graph?.nodes.find(
                        (node) => node.id === edge.versions[0].toNodeId,
                      )?.title
                    }
                    {!edge.versions[0].active && "（已停用）"}
                  </summary>
                  {!demo && (
                    <button
                      className="button text-button"
                      onClick={() =>
                        onEditEdge({
                          workspaceId: workspace!,
                          graph: graph!,
                          selected: selectedNode.id,
                          edge,
                        })
                      }
                    >
                      修改关系
                    </button>
                  )}
                  <ol className="edge-history">
                    {edge.versions.map((v) => (
                      <li key={v.version}>
                        v{v.version} ·{" "}
                        {
                          graph?.nodes.find((node) => node.id === v.fromNodeId)
                            ?.title
                        }{" "}
                        → {relations[v.relation]} →{" "}
                        {
                          graph?.nodes.find((node) => node.id === v.toNodeId)
                            ?.title
                        }{" "}
                        · {v.active ? "有效" : "停用"}
                        <p>{v.changeReason}</p>
                        <time>
                          {new Date(v.createdAt).toLocaleString("zh-CN")}
                        </time>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </section>
            <details className="node-position">
              <summary>节点位置</summary>
              <PositionForm
                key={`${selectedNode.id}:${positions[selectedNode.id]?.join(",")}`}
                position={positions[selectedNode.id]}
                disabled={saving}
                onApply={(point) => {
                  setPositions((previous) => ({
                    ...previous,
                    [selectedNode.id]: point,
                  }));
                  viewChanged();
                }}
              />
            </details>
          </aside>
        )}
      </div>
    </>
  );
}
function PositionForm({
  position,
  disabled,
  onApply,
}: {
  position: Point;
  disabled: boolean;
  onApply: (point: Point) => void;
}) {
  const [point, setPoint] = useState<Point>(position);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onApply(point);
      }}
    >
      <div className="position-inputs">
        {point.map((value, axis) => (
          <label key={axis}>
            {["X", "Y", "Z"][axis]}
            <input
              type="number"
              min={-10000}
              max={10000}
              step="any"
              required
              value={value}
              disabled={disabled}
              onChange={(event) =>
                setPoint(
                  (previous) =>
                    previous.map((v, i) =>
                      i === axis ? Number(event.target.value) : v,
                    ) as Point,
                )
              }
            />
          </label>
        ))}
      </div>
      <button className="button secondary" disabled={disabled}>
        应用位置
      </button>
    </form>
  );
}

export function RelationshipEditor({
  request,
  onClose,
  onSaved,
}: {
  request: EditEdge;
  onClose: () => void;
  onSaved: () => void;
}) {
  const original = request.edge?.versions[0];
  const [from, setFrom] = useState(original?.fromNodeId ?? request.selected);
  const [to, setTo] = useState(
    original?.toNodeId ??
      request.graph.nodes.find((node) => node.id !== request.selected)?.id ??
      "",
  );
  const [relation, setRelation] = useState(original?.relation ?? "supports");
  const [active, setActive] = useState(original?.active ?? true);
  const [reason, setReason] = useState("");
  const [expected, setExpected] = useState(original?.version ?? null);
  const [latest, setLatest] = useState<GraphEdge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const leaving = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const dirty = useRef(false);
  const exitWindow = useRef(false);
  const listener = useRef<Promise<() => void> | null>(null);
  dirty.current =
    reason !== "" ||
    from !== (original?.fromNodeId ?? request.selected) ||
    to !==
      (original?.toNodeId ??
        request.graph.nodes.find((node) => node.id !== request.selected)?.id ??
        "") ||
    relation !== (original?.relation ?? "supports") ||
    active !== (original?.active ?? true);
  const finishClose = async () => {
    if (exitWindow.current) {
      (await listener.current)?.();
      await getCurrentWindow().close();
    }
    onClose();
  };
  const askClose = (window = false) => {
    if (busy.current) return;
    exitWindow.current = window;
    if (dirty.current) leaving.current?.showModal();
    else void finishClose().catch((e) => setError(errorText(e)));
  };
  useEffect(() => {
    dialog.current?.showModal();
    listener.current = getCurrentWindow().onCloseRequested((event) => {
      event.preventDefault();
      askClose(true);
    });
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      void listener.current?.then((unlisten) => unlisten());
      window.removeEventListener("beforeunload", unload);
    };
  }, []);
  const save = async (closing = false) => {
    if (busy.current || !form.current?.reportValidity()) return;
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      await invoke("save_knowledge_edge", {
        input: {
          workspaceId: request.workspaceId,
          edgeId: request.edge?.id ?? null,
          expectedVersion: expected,
          fromNodeId: from,
          toNodeId: to,
          relation,
          active,
          changeReason: reason,
        },
      });
      dirty.current = false;
      if (closing && exitWindow.current) await finishClose();
      else onSaved();
    } catch (e) {
      setError(errorText(e));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <>
      <dialog
        ref={dialog}
        className="form-dialog relation-editor"
        aria-labelledby="edge-edit-title"
        onCancel={(event) => {
          event.preventDefault();
          askClose();
        }}
      >
        <form
          ref={form}
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <header className="drawer-heading">
            <h2 id="edge-edit-title">{original ? "修改关系" : "添加关系"}</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="关闭关系编辑"
              disabled={saving}
              onClick={() => askClose()}
            >
              <X size={19} />
            </button>
          </header>
          <div className="field">
            <label htmlFor="edge-from">起点</label>
            <select
              id="edge-from"
              value={from}
              disabled={saving}
              onChange={(e) => setFrom(e.target.value)}
            >
              {request.graph.nodes.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="edge-relation">关系类型</label>
            <select
              id="edge-relation"
              value={relation}
              disabled={saving}
              onChange={(e) => setRelation(e.target.value)}
            >
              {Object.entries(relations).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="edge-to">终点</label>
            <select
              id="edge-to"
              value={to}
              disabled={saving}
              required
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">请选择</option>
              {request.graph.nodes
                .filter((node) => node.id !== from)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title}
                  </option>
                ))}
            </select>
          </div>
          {original && (
            <label className="edge-active">
              <input
                type="checkbox"
                checked={active}
                disabled={saving}
                onChange={(e) => setActive(e.target.checked)}
              />
              关系有效（取消勾选将保存为停用修订）
            </label>
          )}
          <div className="field">
            <label htmlFor="edge-reason">修改说明</label>
            <input
              id="edge-reason"
              value={reason}
              maxLength={500}
              required
              readOnly={saving}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {error && request.edge && (
            <button
              type="button"
              className="button text-button"
              disabled={saving}
              onClick={() => {
                void invoke<GraphData>("load_knowledge_graph", {
                  workspaceId: request.workspaceId,
                })
                  .then((data) =>
                    setLatest(
                      data.edges.find((edge) => edge.id === request.edge!.id) ??
                        null,
                    ),
                  )
                  .catch((e) => setError(errorText(e)));
              }}
            >
              读取最新关系
            </button>
          )}
          {latest && (
            <div className="conflict-comparison">
              <h3>最新关系 v{latest.versions[0].version}</h3>
              <p>
                {
                  request.graph.nodes.find(
                    (node) => node.id === latest.versions[0].fromNodeId,
                  )?.title
                }{" "}
                → {relations[latest.versions[0].relation]} →{" "}
                {
                  request.graph.nodes.find(
                    (node) => node.id === latest.versions[0].toNodeId,
                  )?.title
                }{" "}
                · {latest.versions[0].active ? "有效" : "停用"}
              </p>
              <p>{latest.versions[0].changeReason}</p>
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setExpected(latest.versions[0].version);
                  setLatest(null);
                  setError(null);
                }}
              >
                已比较，保留我的关系编辑
              </button>
            </div>
          )}
          <footer className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => askClose()}
            >
              取消
            </button>
            <button className="button primary" disabled={saving || !to}>
              {saving ? "保存中…" : "保存关系"}
            </button>
          </footer>
        </form>
      </dialog>
      <dialog
        ref={leaving}
        className="form-dialog"
        aria-labelledby="leave-edge-title"
        onCancel={() => {
          exitWindow.current = false;
        }}
      >
        <h2 id="leave-edge-title">保留未保存的关系修改？</h2>
        <div className="dialog-actions">
          <button
            className="button text-button"
            onClick={() => {
              dirty.current = false;
              void finishClose().catch((e) => setError(errorText(e)));
            }}
          >
            放弃修改
          </button>
          <button
            className="button secondary"
            onClick={() => {
              exitWindow.current = false;
              leaving.current?.close();
            }}
          >
            继续编辑
          </button>
          <button
            className="button primary"
            onClick={() => {
              leaving.current?.close();
              void save(true);
            }}
          >
            保存关系
          </button>
        </div>
      </dialog>
    </>
  );
}
