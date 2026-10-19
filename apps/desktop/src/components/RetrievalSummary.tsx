import type { RetrievalReport } from "../studio";
const reasons: Record<string, string> = {
  included: "已纳入",
  manual_selected: "手动选择已纳入",
  auto_limit: "超过自动条数上限",
  auto_budget: "超过自动预算",
};
export function RetrievalSummary({ report }: { report?: RetrievalReport }) {
  if (!report) return null;
  return (
    <section className="retrieval-summary" aria-label="知识检索结果">
      <p>
        {!report.enabled
          ? "本次自动检索已关闭"
          : report.status === "no_search_terms"
            ? "问题中没有可检索的词语"
            : report.status === "no_match"
              ? "未命中相关的已确认知识"
              : `自动检索：${report.candidates.length} 项候选，${report.includedCount} 项自动纳入`}
      </p>
      {report.candidates.length > 0 && (
        <details>
          <summary>查看命中与排除原因</summary>
          <ul>
            {report.candidates.map((item) => (
              <li key={item.nodeId}>
                <strong>
                  {item.title} · v{item.version}
                </strong>
                <span>{reasons[item.reason] ?? item.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(report.candidatesTruncated || report.queryTruncated) && (
        <p>已按检索上限截取候选或查询词，详细配置见运行审计数据。</p>
      )}
    </section>
  );
}
