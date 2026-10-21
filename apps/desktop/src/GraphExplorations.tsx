import type { GraphNode } from "./graph-data";
import type { GraphCenter, GraphExpansion } from "./graph-query";

export function GraphExplorations({
  expansions,
  centers,
  nodes,
  loading,
  canLoadMore,
  onSelect,
  onMore,
  onCollapse,
  onReset,
}: {
  expansions: GraphExpansion[];
  centers: GraphCenter[];
  nodes: Record<string, GraphNode>;
  loading: boolean;
  canLoadMore: boolean;
  onSelect: (id: string) => void;
  onMore: (id: string) => void;
  onCollapse: (id: string) => void;
  onReset: () => void;
}) {
  return (
    <section className="graph-range-bar" aria-label="关联节点范围">
      <header>
        <strong>已展开的关联（{expansions.length}）</strong>
        <button
          className="button text-button graph-range-reset"
          onClick={onReset}
        >
          返回全部节点
        </button>
      </header>
      {expansions.length === 0 ? (
        <p role="status">已收起全部展开。</p>
      ) : (
        <ul>
          {expansions.map((source) => {
            const center = centers.find((s) => s.root === source.root);
            const name = nodes[source.root]?.title ?? "正在读取节点";
            return (
              <li key={source.root} data-expansion-root={source.root}>
                <button
                  className="button text-button graph-expansion-name"
                  onClick={() => onSelect(source.root)}
                >
                  {name} 的直接关联
                </button>
                <span role="status">
                  {loading ? "正在读取… " : ""}
                  {center
                    ? `已加载 ${center.loadedNodes} / ${center.matchingNodes} 个匹配节点`
                    : "正在读取范围…"}
                </span>
                {center && center.loadedNodes < center.matchingNodes && (
                  <button
                    className="button secondary"
                    disabled={loading || !canLoadMore}
                    title={
                      !canLoadMore
                        ? "已达到当前读取范围上限，请先收起一些展开。"
                        : undefined
                    }
                    onClick={() => onMore(source.root)}
                  >
                    再展开 50 个
                  </button>
                )}
                <button
                  className="button text-button graph-expansion-collapse"
                  aria-label={`收起 ${name} 的展开`}
                  onClick={() => onCollapse(source.root)}
                >
                  收起
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
