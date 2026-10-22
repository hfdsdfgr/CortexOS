import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

export function notify(message: string) {
  window.dispatchEvent(new CustomEvent<string>("cortexos:notice", { detail: message }));
}
export function Toast() {
  const [notice, setNotice] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    let id = 0;
    const onNotice = (event: Event) => setNotice({ text: (event as CustomEvent<string>).detail, id: ++id });
    window.addEventListener("cortexos:notice", onNotice);
    return () => window.removeEventListener("cortexos:notice", onNotice);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  return <div className="notice-region" role="status" aria-live="polite" aria-atomic="true">
    {notice && <div key={notice.id} className="toast"><Check size={16} aria-hidden="true" /><span>{notice.text}</span><button className="toast-close" aria-label="关闭操作提示" onClick={() => setNotice(null)}><X size={14} /></button></div>}
  </div>;
}
