import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, BookOpen, Network, PanelRightClose } from "lucide-react";
import { errorText, type RunDetail, type Studio } from "../studio";
import { navigate } from "../navigation";

export function ChatEvidence({ studio, overlay, runId, onInspect, onClose }: {
  studio: Studio; overlay: boolean; runId: string | null; onInspect: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (overlay) dialog.current?.showModal(); }, [overlay]);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const running = studio.activeRun?.id === runId;
  useEffect(() => {
    setDetail(null); setError(null); setSelected(null);
    if (!runId || !studio.desktop) return;
    let current = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const result = await studio.getRun(runId);
        if (current) { setDetail(result); setError(null); }
      } catch (value) { if (current) setError(errorText(value)); }
      if (current && running) timer = setTimeout(load, 1000);
    };
    void load();
    return () => { current = false; clearTimeout(timer); };
  }, [runId, studio.getRun, running, retry, studio.workspaceId, studio.conversationId]);
  const refs = detail?.contextManifest.knowledgeRefs ?? [];
  const item = refs.find(ref => ref.nodeId === selected);
  const manifest = detail?.contextManifest;
  const content = <>
    <header className="evidence-heading"><h2 id="evidence-title">回答依据</h2><button id="evidence-collapse" className="icon-button" aria-label="收起回答依据" title="收起回答依据" onClick={onClose}><PanelRightClose size={18}/></button></header>
    <div className="evidence-content">
    <div className="evidence-map">
      {refs.length ? <svg viewBox="0 0 300 220" role="group" aria-label="本次回答与所用知识，连线表示纳入本次请求">
        {refs.slice(0, 6).map((ref, i, list) => {
          const angle = i / list.length * Math.PI * 2 - Math.PI / 2;
          const x = 150 + Math.cos(angle) * 95, y = 110 + Math.sin(angle) * 70;
          return <g key={ref.nodeId}>
            <line x1="150" y1="110" x2={x} y2={y} stroke="var(--graph-edge)" />
            <g className="evidence-node" role="button" tabIndex={0} aria-label={`查看依据：${ref.title}`} onClick={() => setSelected(ref.nodeId)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") {event.preventDefault();setSelected(ref.nodeId);} }}>
              <circle cx={x} cy={y} r={selected === ref.nodeId ? 12 : 9} fill="var(--success)"/><text x={x} y={y + (y > 110 ? 24 : -17)} textAnchor="middle">{ref.title.length > 9 ? ref.title.slice(0, 8) + "…" : ref.title}</text>
            </g>
          </g>;
        })}
        <circle cx="150" cy="110" r="15" fill="var(--primary)"/><text x="150" y="140" textAnchor="middle">本次回答</text>
      </svg> : <div className="evidence-empty"><Network size={30} strokeWidth={1.2}/><span>{!runId ? "开始对话，查看回答依据" : !detail ? "正在读取…" : "本次没有选用知识"}</span></div>}
    </div>
    {error && <div className="form-error" role="alert">{error}<button className="button text-button" onClick={() => setRetry(n=>n+1)}>重新读取</button></div>}
    {manifest && <section className="evidence-budget"><div><h3>上下文估算</h3><span className="numeric">{manifest.estimatedUnits.toLocaleString()} / {manifest.budgetUnits.toLocaleString()}</span></div><progress aria-label="上下文估算用量" title={manifest.estimateNote} value={manifest.estimatedUnits} max={Math.max(1, manifest.budgetUnits)}/><details><summary>估算说明</summary><p>{manifest.estimateNote}</p></details></section>}
    <div className="evidence-references">{refs.map(ref => <button key={ref.nodeId} className={`evidence-reference ${selected === ref.nodeId ? "selected" : ""}`} onClick={() => setSelected(ref.nodeId)}><span className="reference-dot"/><span><strong>{ref.title}</strong><span>v{ref.version}</span></span><ArrowUpRight size={14}/></button>)}</div>
    {item && <section className="evidence-selection"><h3>{item.title}</h3><p>{item.content}</p><button className="button secondary" onClick={() => navigate("knowledge", {workspace:studio.workspaceId,node:item.nodeId,version:item.version})}><BookOpen size={14}/>查看此知识版本</button></section>}
    {detail && <button className="button secondary evidence-inspect" onClick={onInspect}>查看完整处理记录<ArrowUpRight size={14}/></button>}
    {!runId && <a className="button secondary" href="#/knowledge">整理项目知识<ArrowUpRight size={14}/></a>}
    </div>
  </>;
  return overlay
    ? <dialog ref={dialog} id="chat-evidence" className="chat-evidence evidence-overlay" aria-labelledby="evidence-title" onClose={onClose}>{content}</dialog>
    : <aside id="chat-evidence" className="chat-evidence" aria-labelledby="evidence-title">{content}</aside>;
}
