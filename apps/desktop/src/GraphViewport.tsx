import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  Component,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
  type Ref,
} from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { Point } from "./graph-data";

export interface ViewportApi {
  capture: () => { camera: Point; target: Point };
  focus: (point: Point) => void;
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
}
function NodeShape({ kind }: { kind: string }) {
  switch (kind) {
    case "event":
    case "input":
    case "context":
      return <boxGeometry args={[0.7, 0.7, 0.7]} />;
    case "hypothesis":
      return <tetrahedronGeometry args={[0.55]} />;
    case "decision":
      return <coneGeometry args={[0.47, 0.9, 5]} />;
    case "evidence":
      return <cylinderGeometry args={[0.37, 0.37, 0.8, 12]} />;
    case "error":
    case "conflict":
      return <octahedronGeometry args={[0.53]} />;
    default:
      return <sphereGeometry args={[0.42, 20, 14]} />;
  }
}
function Scene(props: Props) {
  const { camera, gl, invalidate } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const labelElements = useRef<
    { element: HTMLSpanElement; point: THREE.Vector3 }[]
  >([]);
  const { nodes, edges, positions, selected, onChange } = props;
  const colors = useMemo(() => {
    const styles = getComputedStyle(document.documentElement);
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
  }, []);
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
    for (const label of labelElements.current) {
      const projected = label.point.clone().project(camera);
      label.element.style.visibility =
        projected.z < -1 || projected.z > 1 ? "hidden" : "visible";
      label.element.style.transform = `translate(-50%, -50%) translate3d(${((projected.x + 1) * canvas.clientWidth) / 2}px,${((-projected.y + 1) * canvas.clientHeight) / 2}px,0)`;
    }
  });
  const restore = (position: Point, target: Point) => {
    camera.position.fromArray(position);
    controls.current?.target.fromArray(target);
    controls.current?.update();
    invalidate();
  };
  const focus = (point: Point) => {
    const offset = camera.position
      .clone()
      .sub(controls.current?.target ?? new THREE.Vector3())
      .normalize()
      .multiplyScalar(9);
    restore(new THREE.Vector3(...point).add(offset).toArray() as Point, point);
    onChange();
  };
  useImperativeHandle(props.apiRef, () => ({
    capture: () => ({
      camera: camera.position.toArray() as Point,
      target: (controls.current?.target.toArray() ?? [0, 0, 0]) as Point,
    }),
    focus,
    fit: () => {
      if (!nodes.length) return;
      const box = new THREE.Box3().setFromPoints(
        nodes.map((node) => new THREE.Vector3(...positions[node.id])),
      );
      const center = box.getCenter(new THREE.Vector3());
      const perspective = camera as THREE.PerspectiveCamera;
      const size = box.getSize(new THREE.Vector3()).length();
      const distance = Math.max(
        8,
        ((size /
          (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)))) *
          1.25) /
          Math.min(1, perspective.aspect),
      );
      const direction = camera.position
        .clone()
        .sub(controls.current?.target ?? new THREE.Vector3())
        .normalize();
      restore(
        center.clone().addScaledVector(direction, distance).toArray() as Point,
        center.toArray() as Point,
      );
      onChange();
    },
    reset: () => {
      restore([0, 9, Math.max(22, Math.sqrt(nodes.length) * 5)], [0, 0, 0]);
      onChange();
    },
    restore,
  }));
  const links = useMemo(
    () =>
      edges.map((edge) => {
        const version = edge;
        const from = new THREE.Vector3(...positions[version.fromNodeId]);
        const to = new THREE.Vector3(...positions[version.toNodeId]);
        const direction = to.clone().sub(from).normalize();
        const tip = to.clone().addScaledVector(direction, -0.7);
        return {
          id: edge.id,
          color: new THREE.Color(
            getComputedStyle(document.documentElement)
              .getPropertyValue(
                edge.relation === "executed_before"
                  ? "--trace-order"
                  : edge.relation === "included_in_context"
                    ? "--trace-context"
                    : edge.relation === "saved_output"
                      ? "--trace-output"
                      : "--graph-edge",
              )
              .trim(),
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
    [edges, positions],
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
  const labels = useMemo(() => {
    const ids = new Set<string>(
      selected ? [selected] : nodes.slice(0, 5).map((node) => node.id),
    );
    for (const edge of edges) {
      const v = edge;
      if (v.fromNodeId === selected) ids.add(v.toNodeId);
      if (v.toNodeId === selected) ids.add(v.fromNodeId);
      if (ids.size >= 7) break;
    }
    return ids;
  }, [selected, nodes, edges]);
  useEffect(() => {
    const layer = document.createElement("div");
    layer.className = "graph-label-layer";
    layer.setAttribute("aria-hidden", "true");
    for (const node of nodes.filter((item) => labels.has(item.id))) {
      const element = document.createElement("span");
      element.className = `graph-node-label ${node.id === selected ? "is-selected" : ""}`;
      element.textContent = node.title;
      if (node.badge) {
        const mark = document.createElement("em");
        mark.textContent = node.badge;
        element.append(mark);
      }
      layer.append(element);
      const point = new THREE.Vector3(...positions[node.id]);
      point.y += 0.78;
      labelElements.current.push({ element, point });
    }
    gl.domElement.parentElement?.append(layer);
    invalidate();
    return () => {
      labelElements.current = [];
      layer.remove();
    };
  }, [nodes, positions, selected, labels, gl, invalidate]);
  return (
    <>
      <color
        attach="background"
        args={[
          getComputedStyle(document.documentElement)
            .getPropertyValue("--surface-graph")
            .trim(),
        ]}
      />
      <ambientLight intensity={1.4} />
      <directionalLight position={[8, 12, 10]} intensity={2.2} />
      <OrbitControls
        ref={controls}
        makeDefault
        target={props.target}
        enableDamping={false}
        minDistance={3}
        maxDistance={50000}
        onEnd={onChange}
      />
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
          <bufferAttribute attach="attributes-color" args={[lineColors, 3]} />
        </bufferGeometry>
        <lineBasicMaterial vertexColors />
      </lineSegments>
      {links.map((link) => (
        <mesh key={link.id} position={link.tip} quaternion={link.quaternion}>
          <coneGeometry args={[0.13, 0.4, 6]} />
          <meshBasicMaterial color={link.color} />
        </mesh>
      ))}
      {nodes.map((node) => (
        <group key={node.id} position={positions[node.id]}>
          <mesh
            onClick={(event) => {
              if (event.delta <= 4) {
                event.stopPropagation();
                props.onSelect(node.id);
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              props.onSelect(node.id);
              focus(positions[node.id]);
            }}
          >
            <NodeShape kind={node.kind} />
            <meshStandardMaterial
              color={colors[node.kind]}
              roughness={0.55}
              metalness={0.1}
            />
          </mesh>
          {node.id === selected && (
            <mesh scale={1.5}>
              <sphereGeometry args={[0.48, 18, 14]} />
              <meshBasicMaterial
                color={colors[node.kind]}
                wireframe
                transparent
                opacity={0.4}
              />
            </mesh>
          )}
        </group>
      ))}
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
