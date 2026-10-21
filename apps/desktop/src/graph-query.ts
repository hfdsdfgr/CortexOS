import { invoke } from "@tauri-apps/api/core";
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

export async function readGraphScope(input: {
  workspaceId: string;
  query: string;
  kind: string;
  status: string;
  since: string;
  rootNodeId: string | null;
  targetCount: number;
  extraId: string | null;
}) {
  // ponytail: re-read the requested prefix (at most 10,000 visible nodes); add a page cache only if repeated reads become a measured bottleneck.
  const nodes: GraphNode[] = [];
  let first: GraphNodePage | undefined;
  do {
    const page = await invoke<GraphNodePage>("query_graph_nodes", {
      input: {
        workspaceId: input.workspaceId,
        query: input.query,
        kind: input.kind,
        status: input.status,
        sinceUtc: input.since
          ? new Date(`${input.since}T00:00:00`).toISOString()
          : null,
        rootNodeId: input.rootNodeId,
        offset: nodes.length,
        limit: Math.min(200, input.targetCount - nodes.length),
        expectedSnapshot: first?.snapshot ?? null,
      },
    });
    first ??= page;
    nodes.push(...page.nodes);
    if (!page.nodes.length || nodes.length >= first.matchingNodes) break;
  } while (nodes.length < input.targetCount);
  if (input.extraId && !nodes.some((n) => n.id === input.extraId))
    nodes.push(
      await invoke<GraphNode>("load_graph_node", {
        workspaceId: input.workspaceId,
        nodeId: input.extraId,
      }),
    );
  const edges = await invoke<GraphEdge[]>("load_graph_links", {
    workspaceId: input.workspaceId,
    nodeIds: nodes.map((n) => n.id),
    expectedSnapshot: first!.snapshot,
  });
  const graph: GraphData = {
    nodes,
    edges,
    view: {
      ...first!.view,
      positions: nodes.flatMap((n) =>
        n.savedPosition ? [{ nodeId: n.id, position: n.savedPosition }] : [],
      ),
    },
  };
  return {
    graph,
    totalNodes: first!.totalNodes,
    matchingNodes: first!.matchingNodes,
    rangeNodes: first!.rangeNodes,
  };
}
