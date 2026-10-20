import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import type { GraphData } from "../src/graph-data";

test("measure isolated native synthetic graphs without asserting unmeasured performance targets", async ({}, info) => {
  test.setTimeout(240000);
  const app = await launchNative(info);
  const observations = [];
  try {
    const { page } = app;
    await page.setViewportSize({ width: 1600, height: 900 });
    const session = await app.context.newCDPSession(page);
    await session.send("Performance.enable");
    const metrics = async () => {
      const value = await session.send("Performance.getMetrics");
      return Object.fromEntries(
        value.metrics.map((entry: { name: string; value: number }) => [
          entry.name,
          entry.value,
        ]),
      );
    };
    for (const [nodes, edges] of [
      [100, 1000],
      [500, 1000],
      [1000, 5000],
    ]) {
      await createWorkspace(page, `合成基线 ${nodes} 节点 ${edges} 连线`);
      const workspaceId = await page.getByLabel("当前工作区").inputValue();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "设置", exact: true })
        .click();
      await seedGraph(page, workspaceId, nodes, edges);
      const reads = [];
      for (let index = 0; index < 3; index++) {
        const start = performance.now();
        const graph = await nativeInvoke<GraphData>(
          page,
          "load_knowledge_graph",
          { workspaceId },
        );
        reads.push(performance.now() - start);
        expect(graph.nodes).toHaveLength(nodes);
        expect(graph.edges).toHaveLength(edges);
      }
      const started = performance.now();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "图谱", exact: true })
        .click();
      const canvas = page.locator('canvas[data-webgl-ready="true"]');
      await expect(canvas).toBeVisible();
      await expect
        .poll(async () =>
          Number(await canvas.getAttribute("data-render-count")),
        )
        .toBeGreaterThan(0);
      const openMs = performance.now() - started;
      await page
        .getByRole("button", { name: "显示全部节点", exact: true })
        .click();
      await page.waitForTimeout(350);
      const beforeIdle = Number(await canvas.getAttribute("data-render-count"));
      await page.waitForTimeout(350);
      const idleFrames =
        Number(await canvas.getAttribute("data-render-count")) - beforeIdle;
      const before = await metrics();
      const beforeFrames = Number(
        await canvas.getAttribute("data-render-count"),
      );
      const bounds = (await canvas.boundingBox())!;
      await page.mouse.move(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height / 2,
      );
      const dragStarted = performance.now();
      await page.mouse.down();
      await page.mouse.move(
        bounds.x + bounds.width / 2 + 90,
        bounds.y + bounds.height / 2 + 40,
        { steps: 90 },
      );
      await page.mouse.up();
      const dragMs = performance.now() - dragStarted;
      const frames =
        Number(await canvas.getAttribute("data-render-count")) - beforeFrames;
      const after = await metrics();
      const renderer = await canvas.evaluate((element) => {
        const gl = (element as HTMLCanvasElement).getContext("webgl2");
        const extension = gl?.getExtension("WEBGL_debug_renderer_info");
        return {
          name:
            gl && extension
              ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
              : "unavailable",
          dpr: devicePixelRatio,
          width: element.clientWidth,
          height: element.clientHeight,
        };
      });
      observations.push({
        nodes,
        edges,
        fixture: "synthetic-scoped-database",
        mode: "native WebView2, no model generation",
        viewport: [1600, 900],
        renderer,
        warmReadMs: reads,
        medianWarmReadMs: reads.slice().sort((a, b) => a - b)[1],
        openMs,
        idleFramesOver350ms: idleFrames,
        scriptedDrag: {
          wallMs: dragMs,
          renderedFrames: frames,
          rendersPerSecond: (frames * 1000) / dragMs,
          rendererMainThreadTaskMs:
            (after.TaskDuration - before.TaskDuration) * 1000,
        },
        precedingRenderDrawCalls: Number(
          await canvas.getAttribute("data-draw-calls"),
        ),
        jsHeapUsedBytes: after.JSHeapUsedSize,
        note: "Scripted input cadence affects render rate; this is not measured screen FPS or whole-process CPU/GPU utilization. First graph open includes lazy module load.",
      });
      await page.screenshot({
        path: info.outputPath(`baseline-${nodes}-${edges}.png`),
      });
    }
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await writeFile(
      info.outputPath("baseline.json"),
      JSON.stringify(
        { capturedAt: new Date().toISOString(), observations },
        null,
        2,
      ),
    );
    await app.stop();
  }
});
