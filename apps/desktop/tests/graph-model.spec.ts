import { expect, test } from "@playwright/test";
import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import type { Bootstrap, Message, RunDetail, ModelHealth } from "../src/studio";
import type { GraphData } from "../src/graph-data";

const execute = promisify(execFile);
const endpoint = "http://127.0.0.1:11434";
const reachable = async () => {
  try {
    return (
      await fetch(`${endpoint}/api/version`, {
        signal: AbortSignal.timeout(2000),
      })
    ).ok;
  } catch {
    return false;
  }
};

test("real local generation overlaps a 1000-node graph and records scoped resource samples", async ({}, info) => {
  test.setTimeout(240000);
  const outputLimit = Number(process.env.CORTEXOS_GRAPH_OUTPUT_LIMIT ?? "512");
  if (![512, 2048].includes(outputLimit))
    throw Error("Use 512 or 2048 output tokens");
  let service: ReturnType<typeof spawn> | undefined;
  let app: Awaited<ReturnType<typeof launchNative>> | undefined;
  const observations: unknown[] = [];
  try {
    if (!(await reachable())) {
      if (!process.env.LOCALAPPDATA) throw Error("LOCALAPPDATA unavailable");
      service = spawn(
        join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe"),
        ["serve"],
        {
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
          env: {
            ...process.env,
            OLLAMA_HOST: "127.0.0.1:11434",
            OLLAMA_NO_CLOUD: "1",
            OLLAMA_NUM_PARALLEL: "1",
            OLLAMA_MAX_LOADED_MODELS: "1",
          },
        },
      );
      service.stdout?.resume();
      service.stderr?.resume();
      await expect.poll(reachable, { timeout: 30000 }).toBe(true);
    }
    app = await launchNative(info, {
      dataDirectory: process.env.CORTEXOS_GRAPH_FIXTURE_DIR,
    });
    const { page, context } = app;
    await page.setViewportSize({ width: 1600, height: 900 });
    observations.push({
      viewport: await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      })),
    });
    const health = await nativeInvoke<ModelHealth>(page, "check_ollama");
    expect(
      health.models.some((model) => model.name === "qwen3:4b-instruct"),
    ).toBe(true);
    const existing = (
      await nativeInvoke<Bootstrap>(page, "bootstrap")
    ).workspaces.find((item) => item.name === "合成基线 1000 节点 5000 连线");
    if (existing) await page.getByLabel("当前工作区").selectOption(existing.id);
    else await createWorkspace(page, "真实模型与图谱共存");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    await page.getByRole("button", { name: "新建对话", exact: true }).click();
    if (!existing) await seedGraph(page, workspaceId, 1000, 5000);
    const graph = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    const graphHash = createHash("sha256")
      .update(JSON.stringify(graph))
      .digest("hex");
    const session = await context.newCDPSession(page);
    await session.send("Performance.enable");
    const browserSession = await context.browser()!.newBrowserCDPSession();
    const sample = async (phase: string) => {
      const time = new Date().toISOString();
      const metrics = await session.send("Performance.getMetrics");
      let processes: unknown = null;
      try {
        const value = await browserSession.send("SystemInfo.getProcessInfo");
        const ids = [
          ...new Set([
            app!.processId!,
            ...value.processInfo.map((p: { id: number }) => p.id),
          ]),
        ].filter((id) => Number.isInteger(id) && id > 0);
        const result = await execute(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Get-Process -Id ${ids.join(",")} -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,CPU,WorkingSet64,PrivateMemorySize64 | ConvertTo-Json -Compress`,
          ],
          { windowsHide: true, timeout: 10000 },
        );
        processes = {
          browserCpuTime: value.processInfo,
          memoryAndCpu: JSON.parse(result.stdout),
        };
      } catch (error) {
        processes = { unavailable: String(error) };
      }
      let gpu: unknown = null;
      try {
        const value = await execute(
          "nvidia-smi",
          [
            "--query-gpu=index,name,utilization.gpu,memory.total,memory.used",
            "--format=csv,noheader,nounits",
          ],
          { windowsHide: true, timeout: 10000 },
        );
        gpu = {
          scope: "device total, includes desktop and other applications",
          columns: "index,name,utilization percent,total MiB,used MiB",
          csv: value.stdout.trim(),
        };
      } catch (error) {
        gpu = { unavailable: String(error) };
      }
      const loadedModels = await (await fetch(`${endpoint}/api/ps`)).json();
      const result = {
        phase,
        time,
        sampledUntil: new Date().toISOString(),
        metrics: Object.fromEntries(
          metrics.metrics.map((m: { name: string; value: number }) => [
            m.name,
            m.value,
          ]),
        ),
        processes,
        gpu,
        loadedModels,
      };
      observations.push(result);
      return result;
    };
    const navigate = async (name: string) =>
      page
        .getByRole("navigation")
        .getByRole("link", { name, exact: true })
        .click();
    const settings = async (limit: number) => {
      await navigate("设置");
      await page.getByText("生成参数", { exact: true }).click();
      await page
        .getByLabel("回答长度上限（Token）", { exact: true })
        .fill(String(limit));
      await page.getByRole("button", { name: "保存设置", exact: true }).click();
      await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
      await navigate("对话");
    };
    const send = async (content: string) => {
      await page
        .getByRole("textbox", { name: "你的问题", exact: true })
        .fill(content);
      await page.getByRole("button", { name: "发送消息", exact: true }).click();
    };
    await sample("before-model-load");
    await settings(32);
    await send("请只回复：准备好了。");
    await expect(page.getByText("已完成", { exact: true })).toHaveCount(1, {
      timeout: 150000,
    });
    const conversationId = (
      await nativeInvoke<{ id: string }[]>(page, "list_conversations", {
        workspaceId,
      })
    )[0].id;
    const last = async () =>
      (
        await nativeInvoke<Message[]>(page, "load_messages", {
          workspaceId,
          conversationId,
        })
      ).at(-1)!;
    await settings(outputLimit);
    await sample("model-loaded-idle");
    const started = performance.now();
    await send(
      "请直接输出一张 Markdown 表格，列为 n、n 的平方、n 的立方，n 从 1 连续列到 200。写出每一行，不使用省略号，不用代码替代表格。这是独立的数值生成任务，不依赖本机软件、文件或外部资料。",
    );
    await expect
      .poll(async () => (await last()).content.length, { timeout: 150000 })
      .toBeGreaterThan(0);
    const running = await last();
    expect(running.status).toBe("streaming");
    await navigate("图谱");
    const canvas = page.locator('canvas[data-webgl-ready="true"]');
    await expect(canvas).toBeVisible();
    await page
      .getByRole("button", { name: "显示全部节点", exact: true })
      .click();
    const before = await sample("graph-while-generating");
    const statusBefore = (await last()).status;
    expect(statusBefore).toBe("streaming");
    const frameBefore = Number(await canvas.getAttribute("data-render-count"));
    const bounds = (await canvas.boundingBox())!;
    await page.mouse.move(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    const dragStart = performance.now();
    await page.mouse.down();
    await page.mouse.move(
      bounds.x + bounds.width / 2 + 90,
      bounds.y + bounds.height / 2 + 40,
      { steps: 90 },
    );
    await page.mouse.up();
    const dragMs = performance.now() - dragStart;
    const frames =
      Number(await canvas.getAttribute("data-render-count")) - frameBefore;
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    const filterStart = performance.now();
    await page
      .getByLabel("节点类型筛选", { exact: true })
      .selectOption("context");
    await expect(page.locator(".graph-visible-count")).toHaveText(
      "1 / 1000 节点",
    );
    await page.getByLabel("节点类型筛选", { exact: true }).selectOption("all");
    await expect(page.locator(".graph-visible-count")).toHaveText(
      "1000 / 1000 节点",
    );
    const filterRoundTripMs = performance.now() - filterStart;
    const after = await sample("after-graph-interaction");
    const progress = await last();
    expect(progress.status).toBe("streaming");
    expect(progress.content.length).toBeGreaterThan(running.content.length);
    await page.screenshot({
      path: info.outputPath("real-model-and-graph.png"),
    });
    await expect
      .poll(async () => (await last()).status, { timeout: 150000 })
      .toBe("completed");
    const output = await last();
    const detail = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId: output.modelRunId,
    });
    expect(
      detail.events.some((event) => event.kind === "model_response_received"),
    ).toBe(true);
    expect(detail.settings.numPredict).toBe(outputLimit);
    expect(
      createHash("sha256")
        .update(
          JSON.stringify(
            await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
              workspaceId,
            }),
          ),
        )
        .digest("hex"),
    ).toBe(graphHash);
    await sample("after-generation");
    observations.push({
      result: {
        providerVersion: health.version,
        model: detail.run.modelId,
        outputLimit,
        nodes: 1000,
        edges: 5000,
        graphHash,
        wallMs: performance.now() - started,
        outputCharacters: output.content.length,
        finishReason: output.finishReason,
        interaction: {
          statusBefore,
          statusAfter: progress.status,
          dragMs,
          frames,
          filterRoundTripMs,
          rendererTaskMs:
            (after.metrics.TaskDuration - before.metrics.TaskDuration) * 1000,
        },
        events: detail.events.map((event) => event.kind),
        requestHash: detail.snapshot?.requestHash,
        metrics: (detail.events.at(-1)?.payload as { metrics?: unknown })
          ?.metrics,
      },
    });
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await writeFile(
      info.outputPath("model-graph-observation.json"),
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          observations,
          note: "Isolated synthetic questions and graph. Process CPU values are cumulative seconds; working sets may share pages. GPU values cover the entire device. Script input rate is not screen FPS. Ollama worker CPU and full system resources are not attributed.",
        },
        null,
        2,
      ),
    );
    await app?.stop();
    if (service?.pid && service.exitCode === null)
      spawnSync("taskkill", ["/PID", String(service.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
  }
});
