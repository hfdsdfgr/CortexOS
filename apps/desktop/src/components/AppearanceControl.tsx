import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { preference, remember } from "../studio";

type Appearance = "system" | "light" | "dark";
const stored = preference("appearance");
const initial: Appearance = stored === "dark" || stored === "light" ? stored : "system";
const media = window.matchMedia("(prefers-color-scheme: dark)");
function apply(value: Appearance) {
  const scheme = value === "system" ? (media.matches ? "dark" : "light") : value;
  document.documentElement.dataset.theme = value;
  document.documentElement.dataset.colorScheme = scheme;
}
apply(initial);

export function AppearanceControl() {
  const [appearance, setAppearance] = useState<Appearance>(initial);
  useEffect(() => {
    apply(appearance);
    const update = () => apply(appearance);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [appearance]);
  const Icon = appearance === "system" ? Monitor : appearance === "dark" ? Moon : Sun;
  return <label className="appearance-control" title="外观">
    <Icon size={16} aria-hidden="true" />
    <select aria-label="外观" value={appearance} onChange={event => {
      const value = event.target.value as Appearance;
      setAppearance(value);
      remember("appearance", value);
    }}>
      <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
    </select>
  </label>;
}
