import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus } from "lucide-react";
import { errorText } from "./studio";
import {
  relations,
  type GraphData,
  type GraphEdge,
  type GraphNode,
} from "./graph-data";
import type { RelationPage, HistoryPage } from "./graph-query";
import type { EditEdge } from "./Graph";

export function GraphRelations({
  workspace,
  selected,
  graph,
  demo,
  revision,
  onNodes,
  onSelect,
  onEdit,
}: {
  workspace: string;
  selected: string;
  graph: GraphData;
  demo: boolean;
  revision: number;
  onNodes: (nodes: GraphNode[]) => void;
  onSelect: (id: string) => void;
  onEdit: (request: EditEdge) => void;
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState<RelationPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  const list = useRef<HTMLDetailsElement>(null);
  const focusNext = useRef<number | null>(null);
  useEffect(() => {
    if (loading || !open || focusNext.current === null) return;
    const target = list.current?.querySelectorAll<HTMLElement>(
      ".edge-details > summary",
    )[focusNext.current];
    if (target) {
      target.focus();
      focusNext.current = null;
    }
  }, [page, loading, open]);
  useEffect(() => {
    if (!open || demo) return;
    let current = true;
    setLoading(true);
    setError(null);
    void (async () => {
      let data: RelationPage | undefined;
      const edges: GraphEdge[] = [];
      const nodes: GraphNode[] = [];
      do {
        const next = await invoke<RelationPage>("query_graph_relations", {
          workspaceId: workspace,
          nodeId: selected,
          offset: edges.length,
          limit: Math.min(50, limit - edges.length),
          expectedSnapshot: data?.snapshot ?? null,
        });
        data ??= next;
        edges.push(...next.edges);
        nodes.push(...next.nodes);
        if (!next.edges.length || edges.length >= next.total) break;
      } while (edges.length < limit);
      if (current) {
        setPage({ ...data!, edges, nodes });
        onNodes(nodes);
      }
    })()
      .catch((e) => {
        if (current) setError(errorText(e));
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [workspace, selected, revision, open, limit, retry, demo, onNodes]);
  const edges = demo
    ? graph.edges.filter(
        (e) =>
          e.versions[0].fromNodeId === selected ||
          e.versions[0].toNodeId === selected,
      )
    : (page?.edges ?? []);
  const total = demo ? edges.length : page?.total;
  const allNodes = [...graph.nodes, ...(page?.nodes ?? [])];
  return (
    <details
      ref={list}
      className="node-relations"
      onToggle={(e) => {
        if (e.target === e.currentTarget) {
          setOpen(e.currentTarget.open);
          if (!e.currentTarget.open) focusNext.current = null;
        }
      }}
    >
      <summary>相关关系{total !== undefined ? `（${total}）` : ""}</summary>
      {!demo && (
        <header>
          <button
            className="button text-button"
            onClick={() => onEdit({ workspaceId: workspace, graph, selected })}
          >
            <Plus size={15} />
            添加关系
          </button>
        </header>
      )}
      {loading && <p role="status">正在读取关系…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
          <button
            className="button text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            重新读取关系
          </button>
        </p>
      )}
      {total === 0 && <p>尚未建立关系。</p>}
      {edges.map((edge) => (
        <GraphRelation
          key={`${edge.id}:${edge.versions[0].version}`}
          {...{ edge, workspace, demo, onNodes, onSelect }}
          nodes={allNodes}
          onRefresh={() => setRetry((n) => n + 1)}
          onEdit={() =>
            onEdit({
              workspaceId: workspace,
              graph: { ...graph, nodes: allNodes },
              selected,
              edge,
            })
          }
        />
      ))}
      {total !== undefined && limit < total && (
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => {
            focusNext.current = limit;
            setLimit((n) => n + 50);
          }}
        >
          再显示 50 条关系
        </button>
      )}
    </details>
  );
}
function GraphRelation({
  edge,
  workspace,
  nodes,
  demo,
  onNodes,
  onSelect,
  onEdit,
  onRefresh,
}: {
  edge: GraphEdge;
  workspace: string;
  nodes: GraphNode[];
  demo: boolean;
  onNodes: (nodes: GraphNode[]) => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<HistoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [before, setBefore] = useState<number | null>(null);
  const loaded = useRef(new Set<number | null>());
  const current = edge.versions[0];
  useEffect(() => {
    if (!open || demo || loaded.current.has(before)) return;
    let valid = true;
    setLoading(true);
    setError(null);
    void invoke<HistoryPage>("load_graph_edge_history", {
      workspaceId: workspace,
      edgeId: edge.id,
      beforeVersion: before,
      limit: 50,
    })
      .then((next) => {
        if (!valid) return;
        if (next.latestVersion !== current.version)
          throw Error("关系已更新，请重新读取关系列表。");
        loaded.current.add(before);
        setHistory((prev) =>
          before && prev
            ? {
                ...next,
                versions: [...prev.versions, ...next.versions],
                nodes: [...prev.nodes, ...next.nodes],
              }
            : next,
        );
        onNodes(next.nodes);
      })
      .catch((e) => {
        if (valid) setError(errorText(e));
      })
      .finally(() => {
        if (valid) setLoading(false);
      });
    return () => {
      valid = false;
    };
  }, [workspace, edge.id, current.version, open, before, retry, demo, onNodes]);
  const title = (id: string) =>
    [...nodes, ...(history?.nodes ?? [])].find((n) => n.id === id)?.title ??
    "正在读取节点";
  const versions = demo ? edge.versions : (history?.versions ?? []);
  return (
    <details
      className="edge-details"
      data-edge-id={edge.id}
      onToggle={(e) => {
        if (e.target === e.currentTarget) setOpen(e.currentTarget.open);
      }}
    >
      <summary>
        {title(current.fromNodeId)} → {relations[current.relation]} →{" "}
        {title(current.toNodeId)}
        {!current.active && "（已停用）"}
      </summary>
      <p>这是用户记录的关系，尚未登记证明这条关系的资料。</p>
      <div className="graph-relation-targets">
        <button
          className="button secondary"
          onClick={() => onSelect(current.fromNodeId)}
        >
          查看起点
        </button>
        <button
          className="button secondary"
          onClick={() => onSelect(current.toNodeId)}
        >
          查看终点
        </button>
      </div>
      {!demo && (
        <button className="button text-button" onClick={onEdit}>
          修改关系
        </button>
      )}
      {loading && <p role="status">正在读取历史…</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
          <button
            className="button text-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            重试历史读取
          </button>
          <button className="button text-button" onClick={onRefresh}>
            重新读取关系
          </button>
        </p>
      )}
      <ol className="edge-history">
        {versions.map((v) => (
          <li key={v.version}>
            v{v.version}，{title(v.fromNodeId)} → {relations[v.relation]} →{" "}
            {title(v.toNodeId)}，{v.active ? "有效" : "停用"}
            <p>{v.changeReason}</p>
            <time>{new Date(v.createdAt).toLocaleString("zh-CN")}</time>
          </li>
        ))}
      </ol>
      {history?.nextBefore && (
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => setBefore(history.nextBefore)}
        >
          再读取 50 个版本
        </button>
      )}
    </details>
  );
}
