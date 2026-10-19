import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { launchNative, nativeInvoke, createWorkspace } from "./native";
import type { Message, RunDetail } from "../src/studio";

test("effective knowledge reaches the exact saved model request and survives restart", async ({}, testInfo) => {
  test.setTimeout(120_000);
  const requests: unknown[] = [];
  let rejectInspection = false;
  const server = createServer(async (req, res) => {
    const json = (value: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/version") return json({ version: "context-fixture" });
    if (req.url === "/api/tags")
      return json({
        models: [{ name: "qwen3:4b-instruct", details: { format: "gguf" } }],
      });
    if (req.url === "/api/show")
      return json(
        { details: { format: "gguf" } },
        rejectInspection ? 503 : 200,
      );
    if (req.url !== "/api/chat") return json({}, 404);
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.writeHead(200, { "Content-Type": "application/x-ndjson" });
    res.end(
      JSON.stringify({
        message: { role: "assistant", content: "已按本次参考资料作答。" },
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
    await createWorkspace(page, "上下文闭环");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const input = {
      workspaceId,
      nodeId: null,
      expectedRevision: null,
      title: "发布日",
      kind: "knowledge",
      content: "项目定于周一发布。",
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
    await nativeInvoke(page, "save_knowledge", {
      input: {
        ...input,
        nodeId,
        expectedRevision: 2,
        content: "项目定于周二发布。",
        changeReason: "修订",
      },
    });
    await page.getByText("手动选择：0 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "刷新知识列表" }).click();
    await page.getByRole("checkbox", { name: /发布日/ }).check();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("何时发布？");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    const conversations = await nativeInvoke<{ id: string }[]>(
      page,
      "list_conversations",
      { workspaceId },
    );
    const conversationId = conversations[0].id;
    const messages = await nativeInvoke<Message[]>(page, "load_messages", {
      workspaceId,
      conversationId,
    });
    const runId = messages[0].modelRunId!;
    const first = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId,
    });
    expect(first.snapshot?.request).toEqual(requests[0]);
    expect(first.contextManifest.knowledgeRefs?.[0]).toMatchObject({
      nodeId,
      version: 1,
      content: "项目定于周一发布。",
    });
    expect(JSON.stringify(requests[0])).not.toContain("周二");
    expect(first.events.map((e) => e.kind)).toEqual([
      "request_received",
      "retrieval_started",
      "retrieval_completed",
      "context_prepared",
      "model_inspection_started",
      "model_inspection_completed",
      "model_request_started",
      "model_response_received",
      "response_completed",
    ]);
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 3,
    });
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("现在何时发布？");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByText(/知识生效版本已变化/)).toBeVisible();
    expect(requests).toHaveLength(1);
    await expect(
      page.getByRole("textbox", { name: "你的问题", exact: true }),
    ).toHaveValue("现在何时发布？");
    await page.getByText("手动选择：1 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "刷新知识列表" }).click();
    const choice = page.getByRole("checkbox", { name: /发布日/ });
    await expect(page.getByText(/生效 v2/)).toBeVisible();
    await choice.uncheck();
    await choice.check();
    await page.getByRole("button", { name: "预览上下文", exact: true }).click();
    await expect(page.getByText(/预算 .*UTF-8/)).toBeVisible();
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(page.getByText("已完成", { exact: true })).toHaveCount(2);
    const latestMessages = await nativeInvoke<Message[]>(
      page,
      "load_messages",
      { workspaceId, conversationId },
    );
    const second = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId: latestMessages.at(-1)!.modelRunId,
    });
    expect(second.snapshot?.request).toEqual(requests[1]);
    expect(second.contextManifest.knowledgeRefs?.[0].version).toBe(2);
    await page
      .getByRole("button", { name: "执行过程", exact: true })
      .last()
      .click();
    await expect(
      page.getByText("发布日 · 本次使用 v2", { exact: true }),
    ).toBeVisible();
    await page.getByText("完整请求快照", { exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("context-snapshot.png"),
    });
    await page.getByRole("button", { name: "关闭执行详情" }).click();
    rejectInspection = true;
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("检查失败");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByText("生成失败", { exact: true })).toBeVisible();
    const failedMessages = await nativeInvoke<Message[]>(
      page,
      "load_messages",
      { workspaceId, conversationId },
    );
    const failed = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId: failedMessages.at(-1)!.modelRunId,
    });
    expect(failed.events.map((e) => e.kind)).toEqual([
      "request_received",
      "retrieval_started",
      "retrieval_completed",
      "context_prepared",
      "model_inspection_started",
      "run_failed",
    ]);
    expect(failed.snapshot).not.toBeNull();
    expect(requests).toHaveLength(2);
    await app.closeWindow();
    await app.stop();
    app = await launchNative(testInfo, { endpoint });
    page = app.page;
    expect(
      (await nativeInvoke<RunDetail>(page, "get_run", { workspaceId, runId }))
        .snapshot,
    ).toEqual(first.snapshot);
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
