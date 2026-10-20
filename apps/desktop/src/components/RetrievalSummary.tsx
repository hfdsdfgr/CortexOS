import type { RetrievalReport } from "../studio";
const reasons: Record<string, string> = {
  included: "本次已选用",
  manual_selected: "你已手动选用",
  auto_limit: "超过自动选用的条数上限",
  auto_budget: "超过自动选用的容量上限",
};
export function RetrievalSummary({ report }: { report?: RetrievalReport }) {
  if (!report) return null;
  return (
    <section className="retrieval-summary" aria-label="知识查找结果">
      <p>
        {!report.enabled
          ? "本次没有自动查找知识"
          : report.status === "no_search_terms"
            ? "问题中没有可用于查找的词语"
            : report.status === "no_match"
              ? "没有找到相关的已确认知识"
              : `找到 ${report.candidates.length} 条相关知识，自动选用 ${report.includedCount} 条`}
      </p>
      {report.candidates.length > 0 && (
        <details>
          <summary>查看哪些知识被选用及原因</summary>
          <ul>
            {report.candidates.map((item) => (
              <li key={item.nodeId}>
                <strong>
                  {item.title}，v{item.version}
                </strong>
                <span>{reasons[item.reason] ?? item.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(report.candidatesTruncated || report.queryTruncated) && (
        <p>只显示数量上限内的结果；问题关键词过多时，只使用前面的一部分。</p>
      )}
    </section>
  );
}
