import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { relations, type Point } from "./graph-data";
import type { DisplayNode, DisplayEdge } from "./GraphViewport";

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width + 4 &&
  a.x + a.width + 4 > b.x &&
  a.y < b.y + b.height + 4 &&
  a.y + a.height + 4 > b.y;
interface Candidate {
  key: string;
  id: string;
  text: string;
  badge?: string;
  point: THREE.Vector3;
  selected: boolean;
  edge: boolean;
}
interface Slot {
  element: HTMLSpanElement;
  line: SVGLineElement;
  key: string;
  width: number;
  height: number;
}

export function GraphLabels({
  nodes,
  edges,
  positions,
  selected,
  showEdgeLabels = false,
}: {
  nodes: DisplayNode[];
  edges: DisplayEdge[];
  positions: Record<string, Point>;
  selected: string | null;
  showEdgeLabels?: boolean;
}) {
  const { camera, gl, invalidate } = useThree();
  const slots = useRef<Slot[]>([]);
  const blocked = useRef<Box[]>([]);
  const candidates = useMemo(() => {
    const adjacent = new Set<string>();
    for (const edge of edges) {
      if (edge.fromNodeId === selected) adjacent.add(edge.toNodeId);
      if (edge.toNodeId === selected) adjacent.add(edge.fromNodeId);
    }
    const result: Candidate[] = nodes
      .filter((n) => !selected || n.id === selected || adjacent.has(n.id))
      .map((n) => ({
        key: `node:${n.id}`,
        id: n.id,
        text: n.title,
        badge: n.badge,
        point: new THREE.Vector3(...positions[n.id]),
        selected: n.id === selected,
        edge: false,
      }));
    if (showEdgeLabels && selected)
      for (const edge of edges)
        if (edge.fromNodeId === selected || edge.toNodeId === selected)
          result.push({
            key: `edge:${edge.id}`,
            id: edge.id,
            text: relations[edge.relation] ?? edge.relation,
            point: new THREE.Vector3(...positions[edge.fromNodeId]).lerp(
              new THREE.Vector3(...positions[edge.toNodeId]),
              0.5,
            ),
            selected: false,
            edge: true,
          });
    return result;
  }, [nodes, edges, positions, selected, showEdgeLabels]);
  const current = useRef(candidates);
  current.current = candidates;
  useEffect(() => {
    invalidate();
  }, [candidates, invalidate]);
  useEffect(() => {
    const canvas = gl.domElement;
    const layer = document.createElement("div");
    layer.className = "graph-label-layer";
    layer.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("graph-label-leaders");
    layer.append(svg);
    slots.current = Array.from({ length: 24 }, () => {
      const element = document.createElement("span");
      element.className = "graph-node-label";
      element.style.visibility = "hidden";
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      line.style.visibility = "hidden";
      svg.append(line);
      layer.append(element);
      return { element, line, key: "", width: 0, height: 0 };
    });
    canvas.parentElement?.append(layer);
    const root =
      canvas.closest(".graph-workbench, .trace-workbench") ??
      canvas.parentElement!;
    let frame = 0;
    const resize = new ResizeObserver(() => schedule());
    const observed = new Set<Element>();
    const measure = () => {
      frame = 0;
      const bounds = canvas.getBoundingClientRect();
      const panels = [
        ...root.querySelectorAll<HTMLElement>(
          ".graph-inspector,.graph-node-index,.trace-detail,.trace-index,.graph-legend,.graph-view-status",
        ),
      ];
      blocked.current = panels
        .filter(
          (e) =>
            e.getClientRects().length &&
            getComputedStyle(e).visibility !== "hidden",
        )
        .map((e) => {
          const r = e.getBoundingClientRect();
          return {
            x: r.left - bounds.left,
            y: r.top - bounds.top,
            width: r.width,
            height: r.height,
          };
        });
      const wanted = new Set<Element>([canvas, ...panels]);
      for (const item of observed)
        if (!wanted.has(item)) {
          resize.unobserve(item);
          observed.delete(item);
        }
      for (const item of wanted)
        if (!observed.has(item)) {
          resize.observe(item);
          observed.add(item);
        }
      invalidate();
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    const mutations = new MutationObserver((records) => {
      if (
        records.some(
          (r) =>
            !(
              r.target instanceof Element ? r.target : r.target.parentElement
            )?.closest(".graph-label-layer"),
        )
      )
        schedule();
    });
    mutations.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "hidden", "open"],
    });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      slots.current = [];
      layer.remove();
    };
  }, [gl, invalidate]);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const offset = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    // ponytail: project/sort loaded nodes (knowledge view capped at 10,000) on demanded frames; add spatial culling only after a measured need.
    const width = gl.domElement.clientWidth,
      height = gl.domElement.clientHeight;
    camera.updateMatrixWorld();
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    const visible = [];
    for (const candidate of current.current) {
      projected.copy(candidate.point).project(camera);
      if (
        projected.z < -1 ||
        projected.z > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      )
        continue;
      const x = ((projected.x + 1) * width) / 2,
        y = ((1 - projected.y) * height) / 2;
      offset.copy(candidate.point).addScaledVector(up, 0.8).project(camera);
      visible.push({
        ...candidate,
        x,
        y,
        radius: candidate.edge
          ? 8
          : Math.max(12, (Math.abs(offset.y - projected.y) * height) / 2),
        score: projected.x ** 2 + projected.y ** 2,
      });
    }
    visible.sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) ||
        a.score - b.score ||
        a.key.localeCompare(b.key),
    );
    const pending = [
      ...visible.filter((c) => !c.edge).slice(0, showEdgeLabels ? 21 : 24),
      ...visible.filter((c) => c.edge).slice(0, 3),
    ];
    // Batch text writes, then dimension reads, then placement writes; never interleave per-label layout reads/writes.
    slots.current.forEach((slot, i) => {
      const candidate = pending[i];
      if (!candidate) return;
      const key = `${candidate.key}:${candidate.text}:${candidate.badge ?? ""}:${candidate.selected}`;
      if (slot.key !== key) {
        slot.key = key;
        slot.width = 0;
        slot.element.className = `graph-node-label${candidate.selected ? " is-selected" : ""}${candidate.edge ? " is-relation" : ""}`;
        const title = document.createElement("span");
        title.className = "graph-label-title";
        title.textContent = candidate.text;
        slot.element.replaceChildren(title);
        if (candidate.badge) {
          const badge = document.createElement("em");
          badge.textContent = candidate.badge;
          slot.element.append(badge);
        }
        if (candidate.edge) {
          slot.element.dataset.edgeId = candidate.id;
          delete slot.element.dataset.nodeId;
        } else {
          slot.element.dataset.nodeId = candidate.id;
          delete slot.element.dataset.edgeId;
        }
      }
    });
    slots.current.forEach((slot, i) => {
      if (pending[i] && !slot.width) {
        slot.width = slot.element.offsetWidth;
        slot.height = slot.element.offsetHeight;
      }
    });
    const occupied = [...blocked.current];
    let nodeCount = 0,
      edgeCount = 0;
    slots.current.forEach((slot, i) => {
      const candidate = pending[i];
      let box: Box | undefined;
      if (candidate && (candidate.edge ? edgeCount < 3 : nodeCount < 7)) {
        const w = slot.width,
          h = slot.height,
          r = candidate.radius + 4;
        const choices = [
          [candidate.x - w / 2, candidate.y - r - h],
          [candidate.x + r, candidate.y - h / 2],
          [candidate.x - r - w, candidate.y - h / 2],
          [candidate.x - w / 2, candidate.y + r],
        ];
        for (const [left, top] of choices) {
          if (w > width - 16 || h > height - 16) break;
          const trial = {
            x: Math.max(8, Math.min(width - w - 8, left)),
            y: Math.max(8, Math.min(height - h - 8, top)),
            width: w,
            height: h,
          };
          if (!occupied.some((other) => overlaps(trial, other))) {
            box = trial;
            break;
          }
        }
      }
      slot.element.style.visibility = box ? "visible" : "hidden";
      slot.line.style.visibility = box ? "visible" : "hidden";
      if (!box || !candidate) return;
      occupied.push(box);
      if (candidate.edge) edgeCount++;
      else nodeCount++;
      slot.element.style.transform = `translate3d(${box.x}px,${box.y}px,0)`;
      const endX = Math.max(box.x, Math.min(box.x + box.width, candidate.x)),
        endY = Math.max(box.y, Math.min(box.y + box.height, candidate.y));
      const length = Math.hypot(endX - candidate.x, endY - candidate.y) || 1;
      const start = Math.min(candidate.radius * 0.7, length);
      slot.line.setAttribute(
        "x1",
        String(candidate.x + ((endX - candidate.x) * start) / length),
      );
      slot.line.setAttribute(
        "y1",
        String(candidate.y + ((endY - candidate.y) * start) / length),
      );
      slot.line.setAttribute("x2", String(endX));
      slot.line.setAttribute("y2", String(endY));
    });
  });
  return null;
}
