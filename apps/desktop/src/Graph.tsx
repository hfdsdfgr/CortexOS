import { SelectMenu } from "./components/SelectMenu";
import { invoke } from "@tauri-apps/api/core";
import { notify } from "./components/Toast";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  lazy,
  memo,
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
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { KnowledgeInspector, kinds, type EditKnowledge } from "./Knowledge";
import { navigate, useNavigation } from "./navigation";
import { ExecutionTrace } from "./ExecutionTrace";
import { errorText, type GraphStudio } from "./studio";
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
import { GraphRelations } from "./GraphRelations";
import { GraphMotionControl } from "./GraphMotionControl";
import {
  readGraphScope,
  MAX_GRAPH_CENTERS,
  MAX_GRAPH_NODES,
  type GraphExpansion,
  type GraphCenter,
  type HistoryPage,
} from "./graph-query";
import { GraphExplorations } from "./GraphExplorations";
import type { GraphNode } from "./graph-data";
import type { KnowledgeNode } from "./Knowledge";

const Viewport = lazy(() => import("./GraphViewport"));
interface BrowseState {
  query: string;
  typeFilter: string;
  statusFilter: string;
  since: string;
  expansions: GraphExpansion[] | null;
  showEdgeLabels: boolean;
}
// Like execution sessionViews: browsing preferences last for this app session only.
const sessionBrowse = new Map<string, BrowseState>();
export interface EditEdge {
  workspaceId: string;
  graph: GraphData;
  selected: string;
  edge?: GraphEdge;
}

export const GraphPage = memo(function GraphPage({
  studio,
  revision,
  onEdit,
  onEditEdge,
}: {
  studio: GraphStudio;
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
            <SelectMenu
              id="graph-source"
              value={demo ? "demo" : "workspace"}
              onChange={(event) => setDemo(event.target.value === "demo")}
            >
              <option value="workspace">当前工作区</option>
              <option value="demo">7 节点演示</option>
            </SelectMenu>
            {demo && <strong>演示数据，不写入工作区</strong>}
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
});
function KnowledgeGraph({
  studio,
  revision,
  demo,
  onEdit,
  onEditEdge,
}: {
  studio: GraphStudio;
  revision: number;
  demo: boolean;
  onEdit: (request: EditKnowledge) => void;
  onEditEdge: (request: EditEdge) => void;
}) {
  const route = useNavigation();
  const workspace = studio.workspaceId;
  const browseKey = `${demo ? "demo" : "workspace"}:${workspace ?? "preview"}`;
  const previousBrowse = sessionBrowse.get(browseKey);
  const [graph, setGraph] = useState<GraphData | null>(demo ? demoGraph : null);
  const [positions, setPositions] = useState<Record<string, Point>>(
    demo ? defaultPositions(demoGraph.nodes) : {},
  );
  const [selected, setSelected] = useState<string | null>(route.node);
  const [catalog, setCatalog] = useState<Record<string, GraphNode>>(
    demo ? Object.fromEntries(demoGraph.nodes.map((n) => [n.id, n])) : {},
  );
  const [nodeLimit, setNodeLimit] = useState(200);
  const [counts, setCounts] = useState({
    totalNodes: demo ? demoGraph.nodes.length : 0,
    matchingNodes: demo ? demoGraph.nodes.length : 0,
    rangeNodes: demo ? demoGraph.nodes.length : 0,
    centers: [] as GraphCenter[],
    origins: {} as Record<string, string[]>,
  });
  const dirtyPositions = useRef(new Set<string>());
  const acceptNodes = useCallback((nodes: GraphNode[]) => {
    setCatalog((previous) => ({
      ...previous,
      ...Object.fromEntries(nodes.map((n) => [n.id, n])),
    }));
    setPositions((previous) => ({
      ...previous,
      ...defaultPositions(nodes),
      ...Object.fromEntries(
        nodes.flatMap((n) =>
          n.savedPosition ? [[n.id, n.savedPosition]] : [],
        ),
      ),
      ...Object.fromEntries(
        nodes
          .filter((n) => dirtyPositions.current.has(n.id) && previous[n.id])
          .map((n) => [n.id, previous[n.id]]),
      ),
    }));
  }, []);
  useEffect(() => {
    if (!demo) setSelected(route.node);
  }, [route.node, demo]);
  const [query, setQuery] = useState(previousBrowse?.query ?? "");
  const [typeFilter, setTypeFilter] = useState(
    previousBrowse?.typeFilter ?? "all",
  );
  const [statusFilter, setStatusFilter] = useState(
    previousBrowse?.statusFilter ?? "all",
  );
  const [since, setSince] = useState(previousBrowse?.since ?? "");
  const [showEdgeLabels, setShowEdgeLabels] = useState(
    previousBrowse?.showEdgeLabels ?? false,
  );
  const [listOpen, setListOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inspectorReady, setInspectorReady] = useState(!!route.node);
  const [expansions, setExpansions] = useState<BrowseState["expansions"]>(
    previousBrowse?.expansions ?? null,
  );
  const expansionRoots = expansions?.map((s) => s.root).join(",") ?? "";
  const expansionQuota = expansions?.reduce((n, s) => n + s.limit, 0) ?? 0;
  const [revealed, setRevealed] = useState<string | null>(null);
  const [listLimit, setListLimit] = useState(50);
  const inspector = useRef<HTMLElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const readingScope = useRef(false);
  const scopeGeneration = useRef(0);
  const listToggle = useRef<HTMLButtonElement>(null);
  const restorePendingFocus = useCallback(() => {
    if (!listToggle.current || readingScope.current || !pendingFocus.current)
      return;
    const target = document.querySelector<HTMLElement>(pendingFocus.current);
    if (target?.matches(":disabled")) return;
    (target ?? listToggle.current).focus();
    pendingFocus.current = null;
  }, []);
  const focusAfterUpdate = (selector: string) => {
    pendingFocus.current = selector;
    requestAnimationFrame(restorePendingFocus);
  };
  useEffect(() => {
    sessionBrowse.set(browseKey, {
      query,
      typeFilter,
      statusFilter,
      since,
      expansions,
      showEdgeLabels,
    });
  }, [
    browseKey,
    query,
    typeFilter,
    statusFilter,
    since,
    expansions,
    showEdgeLabels,
  ]);
  const [failed, setFailed] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!loading) requestAnimationFrame(restorePendingFocus);
  }, [loading, graph, restorePendingFocus]);
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
  const loadScope = () =>
    readGraphScope({
      workspaceId: workspace ?? "demo",
      query,
      kind: typeFilter,
      status: statusFilter,
      since,
      expansions,
      targetCount: Math.min(revealed ? 9999 : MAX_GRAPH_NODES, nodeLimit),
      extraId: revealed,
      demo,
    });
  useEffect(() => {
    if (!demo && (!workspace || !studio.desktop)) return;
    scopeGeneration.current++;
    let current = true;
    readingScope.current = true;
    setLoading(true);
    setError(null);
    void loadScope()
      .then(({ graph: data, ...nextCounts }) => {
        if (!current) return;
        setGraph(data);
        setCounts(nextCounts);
        acceptNodes(data.nodes);
        if (!initialView.current) {
          initialView.current = data.view;
          viewVersion.current = data.view.revision;
          setUnsaved(data.view.revision === 0 && data.nodes.length > 0);
        }
      })
      .catch((e) => {
        if (current)
          setError(
            `${errorText(e)}${graph ? " 当前仍显示上一次成功读取的范围。" : ""}`,
          );
      })
      .finally(() => {
        if (current) {
          readingScope.current = false;
          setLoading(false);
        }
      });
    return () => {
      current = false;
      scopeGeneration.current++;
    };
  }, [
    workspace,
    studio.desktop,
    demo,
    revision,
    refresh,
    query,
    typeFilter,
    statusFilter,
    since,
    expansions,
    nodeLimit,
    revealed,
    acceptNodes,
  ]);
  const visible = graph?.nodes ?? [];
  const visibleIds = new Set(visible.map((node) => node.id));
  const visibleEdges =
    graph?.edges.filter(
      (edge) =>
        edge.versions[0].active &&
        visibleIds.has(edge.versions[0].fromNodeId) &&
        visibleIds.has(edge.versions[0].toNodeId),
    ) ?? [];
  const selectedNode =
    catalog[selected ?? ""] ??
    graph?.nodes.find((node) => node.id === selected);
  useEffect(() => {
    if (demo || !workspace || (!selected && !expansions?.length)) return;
    let current = true;
    const ids = [
      ...new Set(
        [selected, ...(expansions ?? []).map((s) => s.root)].filter(
          (id): id is string => !!id,
        ),
      ),
    ];
    void Promise.all(
      ids.map((nodeId) =>
        invoke<GraphNode>("load_graph_node", {
          workspaceId: workspace,
          nodeId,
        }),
      ),
    )
      .then((nodes) => {
        if (current) acceptNodes(nodes);
      })
      .catch((e) => {
        if (current) setError(errorText(e));
      });
    return () => {
      current = false;
    };
  }, [
    workspace,
    selected,
    expansionRoots,
    demo,
    revision,
    refresh,
    acceptNodes,
  ]);
  useEffect(() => {
    if (selectedNode) inspector.current?.focus({ preventScroll: true });
  }, [selectedNode?.id, inspectorReady]);
  useEffect(() => {
    setRevealed(null);
  }, [query, typeFilter, statusFilter, since]);
  useEffect(() => {
    setListLimit(50);
  }, [query, typeFilter, statusFilter, since, expansionRoots]);
  const select = (id: string) => {
    setRevealed(null);
    setSelected(id);
    const canFocus = !failed && visibleIds.has(id) && !!api.current;
    setInspectorReady(!canFocus);
    if (canFocus) api.current!.focus(positions[id]);
    if (!demo)
      navigate("graph", {
        workspace,
        mode: "knowledge",
        node: id,
        back: route.back,
      });
    setListOpen(false);
    requestAnimationFrame(() =>
      inspector.current?.focus({ preventScroll: true }),
    );
  };
  const closeInspector = () => {
    setSelected(null);
    setInspectorReady(false);
    if (!demo) navigate("graph", { workspace, mode: "knowledge" });
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
          positions: [...dirtyPositions.current].map((nodeId) => ({
            nodeId,
            position: positions[nodeId],
          })),
        },
      });
      viewVersion.current = next;
      dirtyPositions.current.clear();
      setUnsaved(false);
      setSaved(true);
      notify("镜头与布局已保存");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  const reloadView = async () => {
    if (!workspace || saving) return;
    const generation = scopeGeneration.current;
    setLoading(true);
    try {
      const { graph: data, ...nextCounts } = await loadScope();
      if (generation !== scopeGeneration.current) return;
      setGraph(data);
      setCounts(nextCounts);
      acceptNodes(data.nodes);
      const knownNodes = Object.values({
        ...catalog,
        ...Object.fromEntries(data.nodes.map((n) => [n.id, n])),
      });
      setPositions({
        ...defaultPositions(knownNodes),
        ...Object.fromEntries(
          knownNodes.flatMap((n) =>
            n.savedPosition ? [[n.id, n.savedPosition]] : [],
          ),
        ),
      });
      initialView.current = data.view;
      viewVersion.current = data.view.revision;
      dirtyPositions.current.clear();
      api.current?.restore(data.view.camera, data.view.target);
      setError(null);
      setUnsaved(false);
      setSaved(false);
    } catch (e) {
      if (generation === scopeGeneration.current) setError(errorText(e));
    } finally {
      if (generation === scopeGeneration.current) setLoading(false);
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
          ref={listToggle}
          className="button secondary graph-list-toggle"
          aria-expanded={listOpen || failed}
          aria-controls="knowledge-node-index"
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
        <button
          className="button secondary"
          aria-expanded={filtersOpen}
          aria-controls="graph-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          筛选
          {[typeFilter !== "all", statusFilter !== "all", !!since].filter(
            Boolean,
          ).length > 0
            ? `（${[typeFilter !== "all", statusFilter !== "all", !!since].filter(Boolean).length}）`
            : ""}
        </button>
        <span className="graph-visible-count" role="status">
          {loading ? "正在读取… " : ""}已加载 {visible.length} /{" "}
          {counts.totalNodes} 节点
        </span>
        {!demo &&
          expansions === null &&
          (graph?.nodes.length ?? 0) < counts.matchingNodes && (
            <button
              className="button secondary"
              disabled={loading || nodeLimit >= 10000}
              title={
                nodeLimit >= 10000
                  ? "单次最多显示10000个节点，请使用搜索或直接关联。"
                  : undefined
              }
              onClick={() => setNodeLimit((n) => Math.min(10000, n + 200))}
            >
              继续加载 200 个节点
            </button>
          )}
        <div className="graph-view-actions">
          <button
            className="icon-button"
            title="适应当前视图"
            aria-label="适应当前视图"
            disabled={failed || !visible.length || saving}
            onClick={() => api.current?.fit()}
          >
            <Focus size={18} />
          </button>
          <button
            className="icon-button"
            title="重置已加载节点布局与视角"
            aria-label="重置已加载节点布局与视角"
            disabled={!graph?.nodes.length || saving}
            onClick={() => {
              if (graph) {
                setPositions((previous) => ({
                  ...previous,
                  ...defaultPositions(graph.nodes),
                }));
                for (const node of graph.nodes)
                  dirtyPositions.current.add(node.id);
              }
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
      <div
        id="graph-filters"
        className="graph-filter-panel"
        hidden={!filtersOpen}
      >
        <SelectMenu
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
        </SelectMenu>
        <SelectMenu
          aria-label="节点审核筛选"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">全部状态</option>
          <option value="confirmed">已确认</option>
          <option value="draft">待确认 / 新草稿</option>
        </SelectMenu>
        <div className="graph-date-filter">
          <label>
            更新日期不早于
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>
        </div>
        <button
          className="button text-button"
          onClick={() => {
            setTypeFilter("all");
            setStatusFilter("all");
            setSince("");
          }}
        >
          重置筛选
        </button>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button
            className="button text-button"
            onClick={() => setRefresh((n) => n + 1)}
          >
            重新读取图谱
          </button>
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
      {expansions !== null && (
        <GraphExplorations
          expansions={expansions}
          centers={counts.centers}
          nodes={catalog}
          loading={loading}
          canLoadMore={expansionQuota + 50 <= MAX_GRAPH_NODES}
          onSelect={select}
          onMore={(root) => {
            setExpansions((current) =>
              !current ||
              current.reduce((n, s) => n + s.limit, 0) + 50 > MAX_GRAPH_NODES
                ? current
                : current.map((s) =>
                    s.root === root ? { ...s, limit: s.limit + 50 } : s,
                  ),
            );
            const center = counts.centers.find((s) => s.root === root);
            if (center && center.loadedNodes + 50 >= center.matchingNodes)
              focusAfterUpdate(".graph-range-reset");
          }}
          onCollapse={(root) => {
            const remaining = expansions.filter((s) => s.root !== root);
            const index = expansions.findIndex((s) => s.root === root);
            setExpansions(remaining);
            const next = remaining[Math.min(index, remaining.length - 1)];
            focusAfterUpdate(
              next
                ? `[data-expansion-root="${next.root}"] .graph-expansion-collapse`
                : ".graph-range-reset",
            );
          }}
          onReset={() => {
            setRevealed(null);
            setExpansions(null);
            focusAfterUpdate(".graph-list-toggle");
          }}
        />
      )}
      <div
        className={`graph-workbench ${selectedNode && inspectorReady ? "has-inspector" : ""} ${listOpen ? "list-is-open" : ""} ${saving ? "is-saving" : ""}`}
      >
        <aside
          id="knowledge-node-index"
          className={`graph-node-index ${failed ? "fallback-list" : ""}`}
          aria-label="图谱节点列表"
          onKeyDown={(event) => {
            if (event.key === "Escape" && (listOpen || !failed)) {
              event.preventDefault();
              setListOpen(false);
              listToggle.current?.focus();
            }
          }}
        >
          <h2>节点</h2>
          {loading && <p role="status">正在读取图谱…</p>}
          <ul>
            {visible.slice(0, listLimit).map((node) => (
              <li key={node.id}>
                <button
                  className="graph-node-row"
                  disabled={loading}
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
                      {kinds[node.kind]}，{" "}
                      {node.latestVersion === node.effectiveVersion
                        ? "已确认"
                        : "草稿"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {listLimit <
            (expansions !== null
              ? expansions.length === 1
                ? counts.matchingNodes
                : visible.length
              : counts.matchingNodes) && (
            <button
              className="button secondary"
              disabled={
                loading || (!demo && listLimit >= (revealed ? 9999 : 10000))
              }
              title={
                !demo && listLimit >= (revealed ? 9999 : 10000)
                  ? "已达到当前视图的节点上限，请缩小筛选范围。"
                  : undefined
              }
              onClick={() => {
                setListLimit((limit) => Math.min(10000, limit + 50));
                if (!demo && listLimit + 50 > visible.length) {
                  if (expansions?.length === 1)
                    setExpansions([
                      {
                        ...expansions[0],
                        limit: Math.max(expansions[0].limit, listLimit + 50),
                      },
                    ]);
                  else setNodeLimit((n) => Math.max(n, listLimit + 50));
                }
                focusAfterUpdate(
                  `#knowledge-node-index li:nth-child(${listLimit + 1}) .graph-node-row`,
                );
              }}
            >
              再显示 50 个节点
            </button>
          )}
          {!visible.length && (
            <p className="small-note">
              {expansions?.length === 0
                ? "已收起全部展开。"
                : counts.totalNodes
                  ? "没有匹配节点。"
                  : "暂无知识节点。"}
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
                focusAfterUpdate("#knowledge-node-index .graph-node-row");
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
          ) : !counts.totalNodes ? (
            <div className="graph-empty">
              <Network size={32} />
              <h2>从知识建立关系</h2>
              <p>先保存知识草稿，再连接相关条目。</p>
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
                      ? "草稿"
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
                showEdgeLabels={showEdgeLabels}
                onSelect={select}
                onExitFocus={closeInspector}
                onFocused={() => setInspectorReady(true)}
                onChange={viewChanged}
                onFailure={onFailure}
              />
            </Suspense>
          )}
          <details className="graph-legend">
            <summary>图例与操作</summary>
            <GraphMotionControl />
            <label className="graph-edge-label-toggle">
              <input
                type="checkbox"
                checked={showEdgeLabels}
                onChange={(e) => setShowEdgeLabels(e.target.checked)}
              />
              显示选中节点的连线名称
            </label>
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
              左键拖动旋转，右键拖动平移，滚轮缩放。点击节点聚焦；拖动画布空白或按
              Esc 返回原视角。方向按“起点 → 关系 → 终点”阅读。
            </p>
            <p>节点的位置只是排布方式，不能据此判断因果关系或内容是否可信。</p>
            <p>
              直接关联只包含当前有效的连线，每次最多增加显示 50
              个节点。搜索与筛选仍然生效；显示范围不会修改知识或关系。
            </p>
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
        {selectedNode && inspectorReady && (
          <aside
            ref={inspector}
            tabIndex={-1}
            className="graph-inspector panel-container"
            aria-label="图谱详情"
          >
            <header className="graph-inspector-toolbar panel-header">
              <button
                className="button text-button"
                disabled={failed || !visibleIds.has(selectedNode.id)}
                onClick={focusSelected}
              >
                <Focus size={15} />
                移到选中节点
              </button>
              <button
                className="icon-button"
                aria-label="关闭图谱详情"
                onClick={() => {
                  api.current?.exitFocus();
                  closeInspector();
                  listToggle.current?.focus();
                }}
              >
                <X size={19} />
              </button>
            </header>
            <div className="panel-body">
            {!visibleIds.has(selectedNode.id) && (
              <div className="graph-hidden-selection" role="status">
                <p>此节点不在当前显示范围，详情仍保留。</p>
                <button
                  className="button secondary"
                  onClick={() => setRevealed(selectedNode.id)}
                >
                  显示这个节点
                </button>
              </div>
            )}
            {revealed === selectedNode.id && (
              <p role="status">已临时显示这个节点，其他筛选保持不变。</p>
            )}
            <div className="graph-explore-actions">
              <button
                className="button secondary"
                onClick={() => {
                  setRevealed(null);
                  setExpansions([{ root: selectedNode.id, limit: 50 }]);
                }}
              >
                只看直接关联
              </button>
              {expansions !== null && (
                <button
                  className="button secondary"
                  disabled={
                    !expansions.some((s) => s.root === selectedNode.id) &&
                    (expansions.length >= MAX_GRAPH_CENTERS ||
                      expansionQuota + 50 > MAX_GRAPH_NODES)
                  }
                  title={
                    expansions.length >= MAX_GRAPH_CENTERS
                      ? "最多同时展开20个节点，请先收起一些展开。"
                      : expansionQuota + 50 > MAX_GRAPH_NODES
                        ? "已达到当前读取范围上限，请先收起一些展开。"
                        : undefined
                  }
                  onClick={() => {
                    if (expansions.some((s) => s.root === selectedNode.id)) {
                      setExpansions(
                        expansions.filter((s) => s.root !== selectedNode.id),
                      );
                      focusAfterUpdate(".graph-inspector");
                    } else
                      setExpansions([
                        ...expansions,
                        { root: selectedNode.id, limit: 50 },
                      ]);
                  }}
                >
                  {expansions.some((s) => s.root === selectedNode.id)
                    ? "收起此处展开"
                    : "展开直接关联"}
                </button>
              )}
            </div>
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
                  api.current?.exitFocus();
                  closeInspector();
                }}
                onEdit={(request) => onEdit({ ...request, returnTo: "graph" })}
                onChanged={() => setRefresh((n) => n + 1)}
              />
            )}
            {expansions !== null && visibleIds.has(selectedNode.id) && (
              <details className="node-display-sources">
                <summary>显示范围</summary>
                <ul>
                  {(counts.origins[selectedNode.id] ?? []).map((root) => (
                    <li key={root}>{catalog[root]?.title ?? "正在读取节点"}</li>
                  ))}
                </ul>
                {revealed === selectedNode.id && <p>临时显示</p>}
              </details>
            )}
            {graph && (
              <GraphRelations
                key={selectedNode.id}
                workspace={workspace ?? "demo"}
                selected={selectedNode.id}
                graph={{
                  ...graph!,
                  nodes: [
                    ...graph!.nodes,
                    ...Object.values(catalog).filter(
                      (n) => !graph!.nodes.some((item) => item.id === n.id),
                    ),
                  ],
                }}
                demo={demo}
                revision={revision + refresh}
                onNodes={acceptNodes}
                onSelect={select}
                onEdit={onEditEdge}
              />
            )}
            <details className="node-position">
              <summary>节点位置</summary>
              <PositionForm
                key={`${selectedNode.id}:${positions[selectedNode.id]?.join(",")}`}
                position={positions[selectedNode.id]}
                disabled={saving}
                onApply={(point) => {
                  dirtyPositions.current.add(selectedNode.id);
                  setPositions((previous) => ({
                    ...previous,
                    [selectedNode.id]: point,
                  }));
                  viewChanged();
                }}
              />
            </details>
            </div>
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
  const [nodeOptions, setNodeOptions] = useState<KnowledgeNode[]>(
    request.graph.nodes,
  );
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [optionsRetry, setOptionsRetry] = useState(0);
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
    let current = true;
    setLoadingOptions(true);
    setOptionsError(null);
    void invoke<KnowledgeNode[]>("list_knowledge", {
      workspaceId: request.workspaceId,
    })
      .then((nodes) => {
        if (current) setNodeOptions(nodes);
      })
      .catch((e) => {
        if (current) setOptionsError(errorText(e));
      })
      .finally(() => {
        if (current) setLoadingOptions(false);
      });
    return () => {
      current = false;
    };
  }, [request.workspaceId, optionsRetry]);
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
    if (
      busy.current ||
      loadingOptions ||
      optionsError ||
      !form.current?.reportValidity()
    )
      return;
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
        className="form-dialog relation-editor panel-dialog"
        aria-labelledby="edge-edit-title"
        onCancel={(event) => {
          event.preventDefault();
          askClose();
        }}
      >
        <form
          ref={form}
          className="panel-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <header className="drawer-heading panel-header">
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
          <div className="panel-body">
          <div className="field">
            <label htmlFor="edge-from">起点</label>
            {loadingOptions && <p role="status">正在读取节点选项…</p>}
            {optionsError && (
              <p className="form-error" role="alert">
                {optionsError}
                <button
                  type="button"
                  className="button text-button"
                  onClick={() => setOptionsRetry((n) => n + 1)}
                >
                  重新读取节点选项
                </button>
              </p>
            )}
            <SelectMenu
              id="edge-from"
              value={from}
              disabled={saving || loadingOptions}
              onChange={(e) => setFrom(e.target.value)}
            >
              {nodeOptions.map((node) => (
                <option key={node.id} value={node.id}>
                  {node.title}
                </option>
              ))}
            </SelectMenu>
          </div>
          <div className="field">
            <label htmlFor="edge-relation">关系类型</label>
            <SelectMenu
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
            </SelectMenu>
          </div>
          <div className="field">
            <label htmlFor="edge-to">终点</label>
            <SelectMenu
              id="edge-to"
              value={to}
              disabled={saving || loadingOptions}
              required
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">请选择</option>
              {nodeOptions
                .filter((node) => node.id !== from)
                .map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.title}
                  </option>
                ))}
            </SelectMenu>
          </div>
          {original && (
            <label className="edge-active">
              <input
                type="checkbox"
                checked={active}
                disabled={saving}
                onChange={(e) => setActive(e.target.checked)}
              />
              使用这条关系（取消勾选会保存一个停用版本）
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
                void invoke<HistoryPage>("load_graph_edge_history", {
                  workspaceId: request.workspaceId,
                  edgeId: request.edge!.id,
                  beforeVersion: null,
                  limit: 1,
                })
                  .then((data) => {
                    setLatest({
                      id: request.edge!.id,
                      versions: data.versions,
                    });
                    setNodeOptions((previous) => [
                      ...previous,
                      ...data.nodes.filter(
                        (n) => !previous.some((p) => p.id === n.id),
                      ),
                    ]);
                  })
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
                  nodeOptions.find(
                    (node) => node.id === latest.versions[0].fromNodeId,
                  )?.title
                }{" "}
                → {relations[latest.versions[0].relation]} →{" "}
                {
                  nodeOptions.find(
                    (node) => node.id === latest.versions[0].toNodeId,
                  )?.title
                }{" "}
                ，{latest.versions[0].active ? "有效" : "停用"}
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
          </div>
          <footer className="dialog-actions panel-footer">
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => askClose()}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={saving || loadingOptions || !!optionsError || !to}
            >
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
