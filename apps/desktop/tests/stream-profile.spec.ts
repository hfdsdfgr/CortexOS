import { expect, test } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { loadAllGraphNodes, seedGraph } from "./graph-fixture";
import type { Bootstrap, Message } from "../src/studio";
import type { GraphData } from "../src/graph-data";

test("measure unchanged graph work during a controlled stream, then verify real filtering and saved output", async ({}, info) => {
  test.setTimeout(180000);
  let response: ServerResponse | undefined;
  const server = createServer(async (req, res) => {
    const json = (value: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/version")
      return json({ version: "stream-profile-fixture" });
    if (req.url === "/api/tags")
      return json({ models: [{ name: "qwen3:4b-instruct" }] });
    if (req.url === "/api/show") return json({ details: { format: "gguf" } });
    for await (const part of req) void part;
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    response = res;
    res.write(
      JSON.stringify({
        message: { role: "assistant", content: "开始\n" },
        done: false,
      }) + "\n",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("fixture port unavailable");
  const app = await launchNative(info, {
    endpoint: `http://127.0.0.1:${address.port}`,
    dataDirectory: process.env.CORTEXOS_GRAPH_FIXTURE_DIR,
  });
  const observations: unknown[] = [];
  try {
    const { page } = app;
    await page.setViewportSize({ width: 1600, height: 900 });
    const existing = (
      await nativeInvoke<Bootstrap>(page, "bootstrap")
    ).workspaces.find((w) => w.name === "合成基线 1000 节点 5000 连线");
    if (existing) await page.getByLabel("当前工作区").selectOption(existing.id);
    else await createWorkspace(page, "流式性能（隔离数据）");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    if (!existing) await seedGraph(page, workspaceId, 1000, 5000);
    const loadGraph = () =>
      nativeInvoke<GraphData>(page, "load_knowledge_graph", { workspaceId });
    const hash = (graph: GraphData) =>
      createHash("sha256").update(JSON.stringify(graph)).digest("hex");
    const graphHash = hash(await loadGraph());
    await page.getByRole("button", { name: "新建对话", exact: true }).click();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("隔离模拟流，仅测界面更新，不代表真实模型性能。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect.poll(() => !!response).toBe(true);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    const canvas = page.locator('canvas[data-webgl-ready="true"]');
    await expect(canvas).toBeVisible();
    await loadAllGraphNodes(page);
    await page
      .getByRole("button", { name: "适应当前视图", exact: true })
      .click();
    await delay(550);
    await page.evaluate(() => {
      const state = { added: 0, removed: 0 };
      const observer = new MutationObserver((records) => {
        for (const record of records) {
          for (const n of record.addedNodes)
            if (n instanceof Element && n.matches(".graph-label-layer"))
              state.added++;
          for (const n of record.removedNodes)
            if (n instanceof Element && n.matches(".graph-label-layer"))
              state.removed++;
        }
      });
      observer.observe(document.querySelector(".graph-workbench")!, {
        childList: true,
        subtree: true,
      });
      Object.assign(window, { streamObservation: { state, observer } });
    });
    const cdp = await app.context.newCDPSession(page);
    await cdp.send("Performance.enable");
    const sample = async () => {
      const value = await cdp.send("Performance.getMetrics");
      return {
        metrics: Object.fromEntries(
          value.metrics.map((m: { name: string; value: number }) => [
            m.name,
            m.value,
          ]),
        ),
        labels: await page.evaluate(() => ({
          ...(
            window as unknown as {
              streamObservation: { state: { added: number; removed: number } };
            }
          ).streamObservation.state,
        })),
        frames: Number(await canvas.getAttribute("data-render-count")),
      };
    };
    const before = await sample();
    let expected = "开始\n";
    const started = performance.now();
    for (let i = 0; i < 200; i++) {
      const content = `第${i}段。`;
      expected += content;
      response!.write(
        JSON.stringify({
          message: { role: "assistant", content },
          done: false,
        }) + "\n",
      );
      await delay(20);
    }
    await delay(150);
    const after = await sample();
    observations.push({
      variant: process.env.CORTEXOS_GRAPH_VARIANT ?? "unspecified",
      graphHash,
      nodes: 1000,
      edges: 5000,
      source:
        "controlled HTTP fixture, 200 frames at requested 20ms cadence; not an Ollama benchmark",
      wallMs: performance.now() - started,
      labelAdds: after.labels.added - before.labels.added,
      labelRemoves: after.labels.removed - before.labels.removed,
      frames: after.frames - before.frames,
      rendererTaskMs:
        (after.metrics.TaskDuration - before.metrics.TaskDuration) * 1000,
      jsHeapUsedBytes: after.metrics.JSHeapUsedSize,
    });
    if (process.env.CORTEXOS_EXPECT_STABLE_GRAPH === "1") {
      expect(after.labels.added - before.labels.added).toBe(0);
      expect(after.frames - before.frames).toBeLessThanOrEqual(2);
    }
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    await page
      .getByLabel("节点类型筛选", { exact: true })
      .selectOption("context");
    await expect(page.locator(".graph-visible-count")).toHaveText(
      "已加载 1 / 1000 节点",
    );
    await page.getByLabel("节点类型筛选", { exact: true }).selectOption("all");
    await expect(page.locator(".graph-visible-count")).toHaveText(
      "已加载 1000 / 1000 节点",
    );
    response!.end(
      JSON.stringify({
        message: { role: "assistant", content: "" },
        done: true,
        done_reason: "stop",
      }) + "\n",
    );
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "对话", exact: true })
      .click();
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    const conversationId = (
      await nativeInvoke<{ id: string }[]>(page, "list_conversations", {
        workspaceId,
      })
    )[0].id;
    const messages = await nativeInvoke<Message[]>(page, "load_messages", {
      workspaceId,
      conversationId,
    });
    expect(messages.at(-1)?.content).toBe(expected);
    expect(messages.at(-1)?.status).toBe("completed");
    expect(hash(await loadGraph())).toBe(graphHash);
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await writeFile(
      info.outputPath("stream-observation.json"),
      JSON.stringify({ observations }, null, 2),
    );
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
