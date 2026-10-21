import { useLayoutEffect, useRef } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Point } from "./graph-data";
import type { DisplayNode } from "./GraphViewport";

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

export function NodeInstances({
  nodes,
  positions,
  color,
  onSelect,
}: {
  nodes: DisplayNode[];
  positions: Record<string, Point>;
  color: string;
  onSelect: (id: string) => void;
}) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    const object = mesh.current;
    if (!object) return;
    const matrix = new THREE.Matrix4();
    nodes.forEach((node, index) =>
      object.setMatrixAt(index, matrix.makeTranslation(...positions[node.id])),
    );
    object.instanceMatrix.needsUpdate = true;
    // Bounds must follow changed positions/counts for both culling and picking.
    object.computeBoundingSphere();
    invalidate();
  }, [nodes, positions, invalidate]);
  return (
    <instancedMesh
      ref={mesh}
      userData={{ graphNode: true }}
      args={[undefined, undefined, nodes.length]}
      onClick={(event) => {
        const node =
          event.instanceId === undefined ? undefined : nodes[event.instanceId];
        if (node && event.delta <= 4) {
          event.stopPropagation();
          onSelect(node.id);
        }
      }}
    >
      <NodeShape kind={nodes[0].kind} />
      <meshStandardMaterial color={color} roughness={0.38} metalness={0.16} />
    </instancedMesh>
  );
}

export interface ArrowPlacement {
  tip: THREE.Vector3;
  quaternion: THREE.Quaternion;
  color: THREE.Color;
}
export function ArrowInstances({ links }: { links: ArrowPlacement[] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const { invalidate } = useThree();
  useLayoutEffect(() => {
    const object = mesh.current;
    if (!object) return;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3(1, 1, 1);
    links.forEach((link, index) => {
      object.setMatrixAt(
        index,
        matrix.compose(link.tip, link.quaternion, scale),
      );
      object.setColorAt(index, link.color);
    });
    object.instanceMatrix.needsUpdate = true;
    if (object.instanceColor) object.instanceColor.needsUpdate = true;
    object.computeBoundingSphere();
    invalidate();
  }, [links, invalidate]);
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, links.length]}>
      <coneGeometry args={[0.09, 0.28, 6]} />
      <meshBasicMaterial transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  );
}
