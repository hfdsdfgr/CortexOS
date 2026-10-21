import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { GraphCamera } from "./GraphCamera";
import { GraphLabels } from "./GraphLabels";
import { Component, useEffect, useMemo, type ReactNode, type Ref } from "react";
import * as THREE from "three";

import type { Point } from "./graph-data";
import { ArrowInstances, NodeInstances } from "./GraphInstances";

export interface ViewportApi {
  capture: () => { camera: Point; target: Point };
  focus: (point: Point) => void;
  exitFocus: () => void;
  reset: () => void;
  fit: () => void;
  restore: (camera: Point, target: Point) => void;
}
export interface DisplayNode {
  id: string;
  title: string;
  kind: string;
  badge?: string;
}
export interface DisplayEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  relation: string;
}
interface Props {
  label?: string;
  showEdgeLabels?: boolean;
  onReady?: () => void;
  nodes: DisplayNode[];
  edges: DisplayEdge[];
  positions: Record<string, Point>;
  selected: string | null;
  camera: Point;
  target: Point;
  apiRef: Ref<ViewportApi>;
  onSelect: (id: string) => void;
  onChange: () => void;
  onFailure: () => void;
  onExitFocus?: () => void;
  onFocused?: () => void;
}
function Scene(props: Props) {
  const { gl } = useThree();
  const { nodes, edges, positions, selected, onChange } = props;
  const colors = useMemo(() => {
    const styles = getComputedStyle(gl.domElement);
    return Object.fromEntries(
      [
        "event",
        "input",
        "output",
        "error",
        "knowledge",
        "context",
        "hypothesis",
        "decision",
        "evidence",
        "conflict",
      ].map((kind) => [kind, styles.getPropertyValue(`--node-${kind}`).trim()]),
    );
  }, [gl]);
  const edgeColors = useMemo(() => {
    const styles = getComputedStyle(gl.domElement);
    return Object.fromEntries(
      [
        "--trace-order",
        "--trace-context",
        "--trace-output",
        "--graph-edge",
        "--primary",
        "--surface-graph",
      ].map((name) => [
        name,
        new THREE.Color(styles.getPropertyValue(name).trim()),
      ]),
    );
  }, [gl]);
  const nodeGroups = useMemo(() => {
    const groups = new Map<string, DisplayNode[]>();
    for (const node of nodes) {
      const group = groups.get(node.kind);
      if (group) group.push(node);
      else groups.set(node.kind, [node]);
    }
    return [...groups.entries()];
  }, [nodes]);
  const selectedNode = nodes.find((node) => node.id === selected);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.setAttribute("aria-label", props.label ?? "3D 知识画布");
    canvas.dataset.webglReady = "true";
    props.onReady?.();
    const lost = (event: Event) => {
      event.preventDefault();
      props.onFailure();
    };
    canvas.addEventListener("webglcontextlost", lost);
    return () => canvas.removeEventListener("webglcontextlost", lost);
  }, [gl, props.onFailure]);
  useFrame(() => {
    const canvas = gl.domElement;
    canvas.dataset.renderCount = String(
      Number(canvas.dataset.renderCount ?? 0) + 1,
    );
    // Renderer counters describe the preceding completed render, not GPU time.
    canvas.dataset.drawCalls = String(gl.info.render.calls);
  });
  const links = useMemo(
    () =>
      edges.map((edge) => {
        const version = edge;
        const from = new THREE.Vector3(...positions[version.fromNodeId]);
        const to = new THREE.Vector3(...positions[version.toNodeId]);
        const direction = to.clone().sub(from).normalize();
        const tip = to.clone().addScaledVector(direction, -0.7);
        const related =
          !selected ||
          edge.fromNodeId === selected ||
          edge.toNodeId === selected;
        return {
          id: edge.id,
          color: edgeColors[
            edge.relation === "executed_before"
              ? "--trace-order"
              : edge.relation === "included_in_context"
                ? "--trace-context"
                : edge.relation === "saved_output"
                  ? "--trace-output"
                  : "--graph-edge"
          ]
            .clone()
            .lerp(
              edgeColors[related && selected ? "--primary" : "--surface-graph"],
              selected ? (related ? 0.35 : 0.8) : 0,
            ),
          from,
          to,
          tip,
          quaternion: new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction,
          ),
        };
      }),
    [edges, positions, edgeColors, selected],
  );
  const points = useMemo(
    () =>
      new Float32Array(
        links.flatMap((link) => [...link.from.toArray(), ...link.to.toArray()]),
      ),
    [links],
  );
  const lineColors = useMemo(
    () =>
      new Float32Array(
        links.flatMap((link) => [
          ...link.color.toArray(),
          ...link.color.toArray(),
        ]),
      ),
    [links],
  );
  return (
    <>
      <color
        attach="background"
        args={[
          getComputedStyle(gl.domElement)
            .getPropertyValue("--surface-graph")
            .trim(),
        ]}
      />
      <ambientLight intensity={0.85} />
      <hemisphereLight args={["#ffffff", "#adb4c4", 0.65]} />
      <directionalLight position={[8, 12, 10]} intensity={1.65} />
      <GraphCamera
        apiRef={props.apiRef}
        positions={nodes.map((node) => positions[node.id])}
        target={props.target}
        onChange={onChange}
        onExitFocus={props.onExitFocus}
        onFocused={props.onFocused}
      />
      <GraphLabels
        nodes={nodes}
        edges={edges}
        positions={positions}
        selected={selected}
        showEdgeLabels={props.showEdgeLabels}
      />
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
          <bufferAttribute attach="attributes-color" args={[lineColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.48}
          depthWrite={false}
        />
      </lineSegments>
      {links.length > 0 && <ArrowInstances links={links} />}
      {nodeGroups.map(([kind, group]) => (
        <NodeInstances
          key={kind}
          nodes={group}
          positions={positions}
          color={colors[kind]}
          onSelect={props.onSelect}
        />
      ))}
      {selectedNode && (
        <mesh position={positions[selectedNode.id]} scale={1.5}>
          <sphereGeometry args={[0.48, 18, 14]} />
          <meshBasicMaterial
            color={colors[selectedNode.kind]}
            transparent
            opacity={0.12}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
class CanvasBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export default function GraphViewport(props: Props) {
  return (
    <CanvasBoundary onFailure={props.onFailure}>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: props.camera, fov: 45, near: 0.1, far: 500000 }}
        gl={{ antialias: true, powerPreference: "default" }}
        fallback={<p>3D 不可用，请使用节点列表。</p>}
      >
        <Scene {...props} />
      </Canvas>
    </CanvasBoundary>
  );
}
