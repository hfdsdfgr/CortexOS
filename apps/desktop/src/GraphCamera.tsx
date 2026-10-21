import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as Controls } from "three-stdlib";
import * as THREE from "three";
import type { Point } from "./graph-data";
import type { ViewportApi } from "./GraphViewport";

type View = { camera: Point; target: Point };
export function GraphCamera({
  apiRef, positions, target, onChange, onExitFocus, onFocused,
}: {
  apiRef: Ref<ViewportApi>;
  positions: Point[];
  target: Point;
  onChange: () => void;
  onExitFocus?: () => void;
  onFocused?: () => void;
}) {
  const { camera, gl, scene, invalidate } = useThree();
  const controls = useRef<Controls>(null);
  const original = useRef<View | null>(null);
  const animation = useRef<{
    from: View;
    to: View;
    started: number;
    focused: boolean;
  } | null>(null);
  const callbacks = useRef({ onChange, onExitFocus, onFocused });
  callbacks.current = { onChange, onExitFocus, onFocused };
  const capture = (): View => ({
    camera: camera.position.toArray() as Point,
    target: (controls.current?.target.toArray() ?? target) as Point,
  });
  const apply = (view: View) => {
    camera.position.fromArray(view.camera);
    controls.current?.target.fromArray(view.target);
    controls.current?.update();
    invalidate();
  };
  const move = (view: View, focused = false) => {
    animation.current = null;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      apply(view);
      callbacks.current.onChange();
      if (focused) callbacks.current.onFocused?.();
    } else {
      animation.current = {
        from: capture(), to: view, started: performance.now(), focused,
      };
      invalidate();
    }
  };
  const exit = (immediate = false) => {
    const view = original.current;
    original.current = null;
    animation.current = null;
    if (view) {
      if (immediate) apply(view);
      else move(view);
    }
    callbacks.current.onExitFocus?.();
  };
  useFrame(() => {
    const flight = animation.current;
    if (!flight) return;
    const progress = Math.min(1, (performance.now() - flight.started) / 420);
    const eased = progress * progress * (3 - 2 * progress);
    const interpolate = (a: Point, b: Point) =>
      a.map((v, i) => v + (b[i] - v) * eased) as Point;
    apply({
      camera: interpolate(flight.from.camera, flight.to.camera),
      target: interpolate(flight.from.target, flight.to.target),
    });
    if (progress === 1) {
      animation.current = null;
      callbacks.current.onChange();
      if (flight.focused) callbacks.current.onFocused?.();
    }
  });
  useImperativeHandle(apiRef, () => ({
    capture,
    exitFocus: () => exit(),
    focus: (point) => {
      original.current ??= capture();
      const direction = camera.position.clone()
        .sub(controls.current?.target ?? new THREE.Vector3()).normalize();
      // Keep a useful neighborhood in frame instead of isolating a single sphere.
      move({
        camera: new THREE.Vector3(...point).addScaledVector(direction, 14).toArray() as Point,
        target: point,
      }, true);
    },
    fit: () => {
      if (!positions.length) return;
      if (original.current) callbacks.current.onExitFocus?.();
      original.current = null;
      const box = new THREE.Box3().setFromPoints(positions.map(p => new THREE.Vector3(...p)));
      const center = box.getCenter(new THREE.Vector3());
      const perspective = camera as THREE.PerspectiveCamera;
      const distance = Math.max(8,
        box.getSize(new THREE.Vector3()).length() * 1.25 /
        (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov / 2)) * Math.min(1, perspective.aspect)),
      );
      const direction = camera.position.clone()
        .sub(controls.current?.target ?? new THREE.Vector3()).normalize();
      move({
        camera: center.clone().addScaledVector(direction, distance).toArray() as Point,
        target: center.toArray() as Point,
      });
    },
    reset: () => {
      if (original.current) callbacks.current.onExitFocus?.();
      original.current = null;
      move({
        camera: [0, 9, Math.max(22, Math.sqrt(positions.length) * 5)],
        target: [0, 0, 0],
      });
    },
    restore: (position, nextTarget) => {
      original.current = null;
      animation.current = null;
      apply({ camera: position, target: nextTarget });
    },
  }));
  useEffect(() => {
    const canvas = gl.domElement;
    let down: { x: number; y: number; blank: boolean } | null = null;
    const pointerDown = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(
        (event.clientX - bounds.left) / bounds.width * 2 - 1,
        -(event.clientY - bounds.top) / bounds.height * 2 + 1,
      ), camera);
      const hit = ray.intersectObjects(scene.children, true)
        .some(item => item.object.userData.graphNode);
      down = { x: event.clientX, y: event.clientY, blank: !hit };
    };
    const pointerMove = (event: PointerEvent) => {
      if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 4) return;
      if (down.blank && original.current) exit(true);
      else if (animation.current) {
        animation.current = null;
        callbacks.current.onFocused?.();
      }
      down = null;
    };
    const pointerUp = () => { down = null; };
    const wheel = () => {
      if (animation.current) {
        animation.current = null;
        callbacks.current.onFocused?.();
        callbacks.current.onChange();
      }
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable=true]")) return;
      exit();
    };
    canvas.addEventListener("pointerdown", pointerDown, true);
    canvas.addEventListener("pointermove", pointerMove, true);
    canvas.addEventListener("pointerup", pointerUp);
    canvas.addEventListener("pointercancel", pointerUp);
    canvas.addEventListener("wheel", wheel, { capture: true, passive: true });
    window.addEventListener("keydown", keyDown);
    return () => {
      animation.current = null;
      canvas.removeEventListener("pointerdown", pointerDown, true);
      canvas.removeEventListener("pointermove", pointerMove, true);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("wheel", wheel, true);
      window.removeEventListener("keydown", keyDown);
    };
  }, [camera, gl, scene]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={target}
      enableDamping={false}
      mouseButtons={{ LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }}
      minDistance={3}
      maxDistance={50000}
      onEnd={() => callbacks.current.onChange()}
    />
  );
}
