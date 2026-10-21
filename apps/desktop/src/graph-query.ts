import { invoke } from "@tauri-apps/api/core";
import { demoGraph, relatedNodeIds } from "./graph-data";
import type {
  GraphData,
  GraphEdge,
  GraphNode,
  EdgeVersion,
} from "./graph-data";

export interface GraphNodePage {
  nodes: GraphNode[];
  totalNodes: number;
  matchingNodes: number;
  rangeNodes: number;
  snapshot: string;
  view: GraphData["view"];
}
export interface RelationPage {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total: number;
  snapshot: string;
}
export interface HistoryPage {
  nodes: GraphNode[];
  versions: EdgeVersion[];
  total: number;
  latestVersion: number;
  nextBefore: number | null;
}

export const MAX_GRAPH_NODES = 10000;
export const MAX_GRAPH_CENTERS = 20;
export interface GraphExpansion {
  root: string;
  limit: number;
}
export interface GraphCenter extends GraphExpansion {
  matchingNodes: number;
  rangeNodes: number;
  loadedNodes: number;
}
export interface GraphScope {
  graph: GraphData;
  totalNodes: number;
  matchingNodes: number;
  rangeNodes: number;
  centers: GraphCenter[];
  origins: Record<string, string[]>;
}

export async function readGraphScope(input: {
  workspaceId: string;
  query: string;
  kind: string;
  status: string;
  since: string;
  expansions: GraphExpansion[] | null;
  targetCount: number;
  extraId: string | null;
  demo: boolean;
}): Promise<GraphScope> {
  // ponytail: re-read bounded prefixes; add a page cache only if repeated reads become a measured bottleneck.
  const sources = input.expansions ?? [
    { root: null, limit: input.targetCount },
  ];
  if (
    sources.length > MAX_GRAPH_CENTERS ||
    sources.reduce((n, s) => n + s.limit, 0) > MAX_GRAPH_NODES
  )
    throw Error("当前展开范围过大，请先收起一些展开或缩小筛选范围。");
  let first: GraphNodePage | undefined;
  const nodes = new Map<string, GraphNode>();
  const centers: GraphCenter[] = [];
  const origins: Record<string, string[]> = {};
  const readPage = async (
    root: string | null,
    offset: number,
    limit: number,
    roots?: string[],
  ): Promise<GraphNodePage> => {
    if (!input.demo)
      return invoke("query_graph_nodes", {
        input: {
          workspaceId: input.workspaceId,
          query: input.query,
          kind: input.kind,
          status: input.status,
          sinceUtc: input.since
            ? new Date(`${input.since}T00:00:00`).toISOString()
            : null,
          rootNodeId: root,
          rootNodeIds: roots,
          offset,
          limit,
          expectedSnapshot: first?.snapshot ?? null,
        },
      });
    const centerIds = roots ?? (root ? [root] : null);
    const rangeIds = centerIds
      ? new Set(centerIds.flatMap((id) => relatedNodeIds(demoGraph, id)))
      : null;
    const rangeNodes = demoGraph.nodes.filter(
      (n) => !rangeIds || rangeIds.has(n.id),
    );
    const matches = rangeNodes.filter(
      (n) =>
        n.title.toLowerCase().includes(input.query.toLowerCase()) &&
        (input.kind === "all" || n.kind === input.kind) &&
        (input.status === "all" ||
          (input.status === "confirmed"
            ? n.latestVersion === n.effectiveVersion
            : n.latestVersion !== n.effectiveVersion)) &&
        (!input.since ||
          new Date(n.updatedAt) >= new Date(`${input.since}T00:00:00`)),
    );
    const ordered = matches
      .slice()
      .sort(
        (a, b) =>
          Number(centerIds?.includes(b.id) ?? false) -
          Number(centerIds?.includes(a.id) ?? false),
      );
    return {
      nodes: ordered
        .slice(offset, offset + limit)
        .map((n) => ({
          ...n,
          layoutIndex: demoGraph.nodes.findIndex((item) => item.id === n.id),
        })),
      totalNodes: demoGraph.nodes.length,
      matchingNodes: matches.length,
      rangeNodes: rangeNodes.length,
      snapshot: "demo",
      view: demoGraph.view,
    };
  };
  // A separate one-row union query gives an exact distinct total without downloading every neighborhood.
  if (input.expansions && input.expansions.length !== 1)
    first = await readPage(
      null,
      0,
      1,
      input.expansions.map((s) => s.root),
    );
  for (const source of sources) {
    const rows: GraphNode[] = [];
    let summary: GraphNodePage | undefined;
    do {
      const page = await readPage(
        source.root,
        rows.length,
        Math.min(200, source.limit - rows.length),
      );
      first ??= page;
      summary ??= page;
      rows.push(...page.nodes);
      if (!page.nodes.length || rows.length >= page.matchingNodes) break;
    } while (rows.length < source.limit);
    for (const node of rows) {
      nodes.set(node.id, node);
      if (source.root) (origins[node.id] ??= []).push(source.root);
    }
    if (source.root)
      centers.push({
        root: source.root,
        limit: source.limit,
        loadedNodes: rows.length,
        matchingNodes: summary!.matchingNodes,
        rangeNodes: summary!.rangeNodes,
      });
  }
  if (input.extraId && !nodes.has(input.extraId)) {
    const node = input.demo
      ? demoGraph.nodes.find((n) => n.id === input.extraId)
      : await invoke<GraphNode>("load_graph_node", {
          workspaceId: input.workspaceId,
          nodeId: input.extraId,
        });
    if (node) nodes.set(node.id, node);
  }
  if (nodes.size > MAX_GRAPH_NODES)
    throw Error("当前显示节点过多，请先收起一些展开再显示这个节点。");
  const list = [...nodes.values()];
  const edges = input.demo
    ? demoGraph.edges.filter(
        (e) =>
          e.versions[0].active &&
          nodes.has(e.versions[0].fromNodeId) &&
          nodes.has(e.versions[0].toNodeId),
      )
    : await invoke<GraphEdge[]>("load_graph_links", {
        workspaceId: input.workspaceId,
        nodeIds: list.map((n) => n.id),
        expectedSnapshot: first!.snapshot,
      });
  return {
    graph: {
      nodes: list,
      edges,
      view: {
        ...first!.view,
        positions: list.flatMap((n) =>
          n.savedPosition ? [{ nodeId: n.id, position: n.savedPosition }] : [],
        ),
      },
    },
    totalNodes: first!.totalNodes,
    matchingNodes: first!.matchingNodes,
    rangeNodes: first!.rangeNodes,
    centers,
    origins,
  };
}
