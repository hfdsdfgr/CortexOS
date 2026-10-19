import { CheckCircle2, Unplug, ChevronRight } from "lucide-react";
import type { Studio } from "../studio";
export function ModelStatus({ studio }: { studio: Studio }) {
  return (
    <a
      href="#/settings"
      className={`model-status ${studio.health ? "connected" : ""}`}
    >
      {studio.health ? (
        <CheckCircle2 size={15} aria-hidden="true" />
      ) : (
        <Unplug size={15} aria-hidden="true" />
      )}
      <span>
        {studio.checking
          ? "正在检测…"
          : studio.health
            ? studio.health.models.length
              ? "Ollama 已连接"
              : "尚未安装模型"
            : "模型未连接"}
      </span>
      <ChevronRight size={14} aria-hidden="true" />
    </a>
  );
}
