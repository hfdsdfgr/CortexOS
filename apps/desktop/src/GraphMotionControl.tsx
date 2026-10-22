import { SelectMenu } from "./components/SelectMenu";
import { useId, useState } from "react";
import { preference, remember } from "./studio";

type Motion = "smooth" | "system" | "instant";
let sessionMotion: Motion = "smooth";
function readMotion(): Motion {
  const saved = preference("graph-motion");
  return saved === "smooth" || saved === "system" || saved === "instant"
    ? saved
    : sessionMotion;
}

export function animateGraphCamera() {
  const motion = readMotion();
  return (
    motion === "smooth" ||
    (motion === "system" &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches)
  );
}

export function GraphMotionControl() {
  const id = useId();
  const [motion, setMotion] = useState(readMotion);
  return (
    <div className="field graph-motion-control">
      <label htmlFor={id}>镜头过渡</label>
      <SelectMenu
        id={id}
        value={motion}
        onChange={(event) => {
          const next = event.target.value as Motion;
          sessionMotion = next;
          remember("graph-motion", next);
          setMotion(next);
        }}
      >
        <option value="smooth">平滑（0.42秒）</option>
        <option value="system">跟随系统</option>
        <option value="instant">立即切换</option>
      </SelectMenu>
    </div>
  );
}
