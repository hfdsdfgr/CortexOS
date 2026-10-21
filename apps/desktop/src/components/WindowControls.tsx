import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

export function WindowDragRegion({ onError }: { onError: (error: unknown) => void }) {
  return (
    <div
      className="window-drag-region"
      aria-hidden="true"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const window = getCurrentWindow();
        void (event.detail === 2 ? window.toggleMaximize() : window.startDragging()).catch(onError);
      }}
    />
  );
}

export function WindowControls({ onError }: { onError: (error: unknown) => void }) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    const window = getCurrentWindow();
    let current = true;
    const update = () => {
      void window.isMaximized().then(value => {
        if (current) setMaximized(value);
      }).catch(onError);
    };
    update();
    const listener = window.onResized(update).catch(onError);
    return () => {
      current = false;
      void listener.then(unlisten => unlisten?.()).catch(onError);
    };
  }, [onError]);
  return (
    <div className="window-controls" role="group" aria-label="窗口操作">
      <button className="window-control" aria-label="最小化窗口" title="最小化"
        onClick={() => { void getCurrentWindow().minimize().catch(onError); }}>
        <Minus size={16} aria-hidden="true" />
      </button>
      <button className="window-control" aria-label={maximized ? "还原窗口" : "最大化窗口"}
        title={maximized ? "还原" : "最大化"}
        onClick={() => { void getCurrentWindow().toggleMaximize().catch(onError); }}>
        {maximized ? <Copy size={14} aria-hidden="true" /> : <Square size={14} aria-hidden="true" />}
      </button>
      <button className="window-control window-close" aria-label="关闭窗口" title="关闭"
        onClick={() => { void getCurrentWindow().close().catch(onError); }}>
        <X size={17} aria-hidden="true" />
      </button>
    </div>
  );
}
