import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import type { Message } from "../src/studio";
import { projectExecution, type ExecutionData } from "../src/execution-data";

test("execution graph uses real events and navigates to exact versions and messages", async ({}, testInfo) => {
  test.setTimeout(120_000);
  let slow = false;
  const server = createServer(async (req, res) => {
    const json = (value: unknown) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/version") return json({ version: "trace-fixture" });
    if (req.url === "/api/tags")
      return json({
        models: [{ name: "qwen3:4b-instruct", details: { format: "gguf" } }],
      });
    if (req.url === "/api/show") return json({ details: { format: "gguf" } });
    for await (const chunk of req) {
      void chunk;
    }
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    if (slow) {
      res.write(
        JSON.stringify({
          message: { role: "assistant", content: "持续生成中" },
          done: false,
        }) + "\n",
      );
      const timer = setTimeout(
        () =>
          res.end(
            JSON.stringify({
              message: { role: "assistant", content: "完成" },
              done: true,
              done_reason: "stop",
            }) + "\n",
          ),
        2500,
      );
      res.on("close", () => clearTimeout(timer));
      return;
    }
    res.end(
      JSON.stringify({
        message: { role: "assistant", content: "执行图测试回答。" },
        done: true,
        done_reason: "stop",
      }) + "\n",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("port");
  const endpoint = `http://127.0.0.1:${address.port}`;
  let app = await launchNative(testInfo, { endpoint });
  try {
    let page = app.page;
    page.setDefaultTimeout(10_000);
    await createWorkspace(page, "执行追溯 A");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const input = {
      workspaceId,
      nodeId: null,
      expectedRevision: null,
      title: "发布约定",
      kind: "knowledge",
      content: "旧版约定：周一发布。",
      changeReason: "初始",
      sourceMessageId: null,
      sourceExcerpt: null,
    };
    const nodeId = await nativeInvoke<string>(page, "save_knowledge", {
      input,
    });
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 1,
    });
    await page.getByText("手动选择：0 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "刷新知识列表" }).click();
    await page.getByRole("checkbox", { name: /发布约定/ }).check();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("查看发布约定");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
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
    const runId = messages[0].modelRunId!;
    await nativeInvoke(page, "save_knowledge", {
      input: {
        ...input,
        nodeId,
        expectedRevision: 2,
        content: "新版约定：周二发布。",
        changeReason: "修改",
      },
    });
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 3,
    });
    await page
      .getByRole("button", { name: "3D 执行轨迹", exact: true })
      .click();
    await expect(page.getByRole("radio", { name: "执行过程" })).toBeChecked();
    await expect(
      page.locator('canvas[data-webgl-ready="true"]'),
    ).toHaveAttribute("aria-label", "3D 执行画布");
    const data = await nativeInvoke<ExecutionData>(
      page,
      "load_execution_graph",
      { workspaceId, runId },
    );
    const projection = projectExecution(data);
    expect(projection.nodes.filter((n) => n.seq !== undefined)).toHaveLength(
      data.detail.events.length,
    );
    expect(projection.nodes.some((n) => n.title.includes("验证"))).toBe(false);
    expect(
      projection.edges.filter((e) => e.relation === "executed_before"),
    ).toHaveLength(data.detail.events.length - 1);
    const legacy = projectExecution({
      ...data,
      detail: {
        ...data.detail,
        snapshot: null,
        contextManifest: { ...data.detail.contextManifest, knowledgeRefs: [] },
      },
    });
    expect(
      legacy.nodes.every((n) => n.seq !== undefined || n.id === "output"),
    ).toBe(true);
    await page
      .getByRole("button", { name: "发布约定 · v1", exact: true })
      .click();
    await expect(page.getByLabel("执行节点详情")).toContainText(
      "旧版约定：周一发布。",
    );
    await page.getByRole("button", { name: "移到选中节点", exact: true }).click();
    await page
      .getByRole("button", { name: "保存执行视角", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "保存执行视角", exact: true }),
    ).toBeDisabled();
    const saved = (
      await nativeInvoke<ExecutionData>(page, "load_execution_graph", {
        workspaceId,
        runId,
      })
    ).view;
    expect(saved.revision).toBe(1);
    const traceUrl = page.url();
    await page
      .getByRole("button", { name: "查看知识 v1", exact: true })
      .click();
    await expect(page.locator(".knowledge-prose").first()).toHaveText(
      "旧版约定：周一发布。",
    );
    await expect(page.getByText("知识 v1", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "返回执行轨迹" }).click();
    await expect(page).toHaveURL(traceUrl);
    await expect(page.getByLabel("执行节点详情")).toContainText(
      "旧版约定：周一发布。",
    );
    await page.getByRole("button", { name: "本次问题", exact: true }).click();
    await page.getByRole("button", { name: "查看对应消息", exact: true }).click();
    await expect(
      page.locator(`[id="message-${messages[0].id}"]`),
    ).toBeFocused();
    await page.getByRole("link", { name: "返回执行轨迹" }).click();
    await page.getByRole("button", { name: "显示完整流程", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("native-execution-trace.png"),
    });
    await page
      .getByRole("button", { name: "保存执行视角", exact: true })
      .click();
    await page
      .locator("canvas")
      .evaluate((canvas) =>
        canvas.dispatchEvent(
          new Event("webglcontextlost", { cancelable: true }),
        ),
      );
    await expect(
      page.getByRole("heading", { name: "3D 不可用", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "最终输出", exact: true }).click();
    await expect(page.getByLabel("执行节点详情")).toContainText(
      "执行图测试回答。",
    );
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "查看对应消息", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("native-trace-narrow.png"),
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    slow = true;
    await page.getByRole("button", { name: "定位回答", exact: true }).click();
    await page.getByText("手动选择：1 项知识", { exact: true }).click();
    await page.getByRole("checkbox", { name: /发布约定/ }).uncheck();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("实时执行图");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByText("持续生成中", { exact: true })).toBeVisible();
    await page
      .getByRole("button", { name: "3D 执行轨迹", exact: true })
      .last()
      .click();
    await expect(page.locator(".trace-heading")).toContainText("进行中");
    await expect(page.locator(".trace-heading")).toContainText("已完成", {
      timeout: 10000,
    });
    await expect(page.getByRole("button", { name: /回答完成/ })).toBeVisible();
    await page.getByLabel("回答记录", { exact: true }).selectOption(runId);
    const terminal = await nativeInvoke<ExecutionData>(
      page,
      "load_execution_graph",
      { workspaceId, runId },
    );
    await createWorkspace(page, "执行追溯 B");
    const other = await page.getByLabel("当前工作区").inputValue();
    await expect(
      nativeInvoke(page, "load_execution_graph", { workspaceId: other, runId }),
    ).rejects.toThrow();
    expect(
      await nativeInvoke(page, "list_runs", { workspaceId: other }),
    ).toEqual([]);
    await app.closeWindow();
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    app = await launchNative(testInfo, { endpoint });
    page = app.page;
    await page.evaluate(
      ({ workspaceId, runId }) => {
        location.hash = `/graph?workspace=${workspaceId}&mode=execution&run=${runId}&event=output`;
      },
      { workspaceId, runId },
    );
    await expect(page.getByLabel("执行节点详情")).toContainText(
      "执行图测试回答。",
    );
    const reopened = await nativeInvoke<ExecutionData>(
      page,
      "load_execution_graph",
      { workspaceId, runId },
    );
    expect(reopened.view).toEqual(terminal.view);
    expect(reopened.detail.events).toEqual(terminal.detail.events);
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
