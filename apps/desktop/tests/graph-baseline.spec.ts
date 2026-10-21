import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { loadAllGraphNodes, seedGraph } from "./graph-fixture";
import type { GraphData, GraphEdge } from "../src/graph-data";
import type { GraphNodePage } from "../src/graph-query";
import type { Bootstrap } from "../src/studio";

test("measure isolated native synthetic graphs without asserting unmeasured performance targets", async ({}, info) => {
  test.setTimeout(240000);
  const app = await launchNative(info, {
    dataDirectory: process.env.CORTEXOS_GRAPH_FIXTURE_DIR,
  });
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
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "设置", exact: true })
        .click();
      const name = `合成基线 ${nodes} 节点 ${edges} 连线`;
      const existing = (
        await nativeInvoke<Bootstrap>(page, "bootstrap")
      ).workspaces.find((item) => item.name === name);
      if (existing)
        await page.getByLabel("当前工作区").selectOption(existing.id);
      else await createWorkspace(page, name);
      const workspaceId = await page.getByLabel("当前工作区").inputValue();
      if (!existing) await seedGraph(page, workspaceId, nodes, edges);
      const reads = [];
      const pagedReads = [];
      let fullBytes = 0;
      let pageAndLinksBytes = 0;
      let initialLinks = 0;
      let graphHash = "";
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
        fullBytes = Buffer.byteLength(JSON.stringify(graph));
        const digest = createHash("sha256")
          .update(JSON.stringify(graph))
          .digest("hex");
        if (graphHash) expect(digest).toBe(graphHash);
        graphHash = digest;
        const pagedStart = performance.now();
        const first = await nativeInvoke<GraphNodePage>(
          page,
          "query_graph_nodes",
          {
            input: {
              workspaceId,
              query: "",
              kind: "all",
              status: "all",
              sinceUtc: null,
              rootNodeId: null,
              offset: 0,
              limit: 200,
              expectedSnapshot: null,
            },
          },
        );
        const links = await nativeInvoke<GraphEdge[]>(
          page,
          "load_graph_links",
          {
            workspaceId,
            nodeIds: first.nodes.map((n) => n.id),
            expectedSnapshot: first.snapshot,
          },
        );
        pagedReads.push(performance.now() - pagedStart);
        const ids = new Set(first.nodes.map((n) => n.id));
        expect(links).toEqual(
          graph.edges
            .filter(
              (e) =>
                e.versions[0].active &&
                ids.has(e.versions[0].fromNodeId) &&
                ids.has(e.versions[0].toNodeId),
            )
            .map((e) => ({ ...e, versions: [e.versions[0]] })),
        );
        pageAndLinksBytes = Buffer.byteLength(JSON.stringify({ first, links }));
        initialLinks = links.length;
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
      const initialLoadedNodes = Math.min(200, nodes);
      await expect(page.locator(".graph-visible-count")).toHaveText(
        `已加载 ${initialLoadedNodes} / ${nodes} 节点`,
      );
      const loadAllStarted = performance.now();
      await loadAllGraphNodes(page);
      const loadAllMs = performance.now() - loadAllStarted;
      await page
        .getByRole("button", { name: "适应当前视图", exact: true })
        .click();
      // V3 fit animates for 420 ms; sample idle only after it has settled.
      await page.waitForTimeout(500);
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
        labelSlots: await page.locator(".graph-label-layer .graph-node-label").count(),
        visibleLabels: await page.locator(".graph-label-layer .graph-node-label:visible").count(),
        fixture: "synthetic-scoped-database",
        graphHash,
        variant: process.env.CORTEXOS_GRAPH_VARIANT ?? "unspecified",
        mode: "native WebView2, no model generation",
        viewport: [1600, 900],
        renderer,
        warmReadMs: reads,
        medianWarmReadMs: reads.slice().sort((a, b) => a - b)[1],
        pagedReadMs: pagedReads,
        medianPagedReadMs: pagedReads.slice().sort((a, b) => a - b)[1],
        fullBytes,
        pageAndLinksBytes,
        initialLoadedNodes,
        initialLinks,
        loadAllMs,
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
