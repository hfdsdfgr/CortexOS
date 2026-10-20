import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import type {
  Message,
  RunDetail,
  Conversation,
  ContextManifest,
} from "../src/studio";

test("automatic retrieval records actual requests, approved versions and persistent per-conversation opt-out", async ({}, testInfo) => {
  test.setTimeout(120000);
  const requests: unknown[] = [];
  const server = createServer(async (req, res) => {
    const json = (value: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/version")
      return json({ version: "retrieval-fixture" });
    if (req.url === "/api/tags")
      return json({ models: [{ name: "qwen3:4b-instruct" }] });
    if (req.url === "/api/show") return json({ details: { format: "gguf" } });
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader("Content-Type", "application/x-ndjson");
    res.end(
      JSON.stringify({
        message: { role: "assistant", content: "已使用本次请求中的资料。" },
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
    await createWorkspace(page, "自动知识检索");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("切换检索时保留草稿");
    await page
      .getByRole("checkbox", { name: "自动查找知识", exact: true })
      .uncheck();
    await expect(
      page.getByRole("checkbox", { name: "自动查找知识", exact: true }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("textbox", { name: "你的问题", exact: true }),
    ).toHaveValue("切换检索时保留草稿");
    await page
      .getByRole("checkbox", { name: "自动查找知识", exact: true })
      .check();
    await expect(
      page.getByRole("checkbox", { name: "自动查找知识", exact: true }),
    ).toBeChecked();
    const input = {
      workspaceId,
      nodeId: null,
      expectedRevision: null,
      title: "发布安排",
      kind: "knowledge",
      content: "发布安排：周一。",
      changeReason: "测试",
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
        content: "发布安排：周二。",
      },
    });
    await expect(
      page.getByRole("checkbox", { name: "自动查找知识", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("何时发布？");
    await page.getByText("手动选择：0 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "查看本次会用的资料", exact: true }).click();
    await expect(page.getByLabel("知识查找结果")).toContainText("自动选用 1 条");
    expect(requests).toHaveLength(0);
    await page.getByText("手动选择：0 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect.poll(() => requests.length).toBe(1);
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    const conversationId = (
      await nativeInvoke<Conversation[]>(page, "list_conversations", {
        workspaceId,
      })
    )[0].id;
    const last = async () => {
      const messages = await nativeInvoke<Message[]>(page, "load_messages", {
        workspaceId,
        conversationId,
      });
      return nativeInvoke<RunDetail>(page, "get_run", {
        workspaceId,
        runId: messages.at(-1)!.modelRunId,
      });
    };
    const first = await last();
    expect(first.snapshot?.request).toEqual(requests[0]);
    expect(first.contextManifest.knowledgeRefs?.[0]).toMatchObject({
      nodeId,
      version: 1,
      reason: "automatic_effective_knowledge",
    });
    expect(JSON.stringify(requests[0])).not.toContain("周二");
    await page
      .getByRole("button", { name: "3D 执行轨迹", exact: true })
      .click();
    await page.getByRole("button", { name: /知识查找完成/ }).click();
    await expect(page.getByLabel("执行节点详情")).toContainText("自动选用 1 条");
    await expect(page.locator('canvas[data-webgl-ready="true"]')).toBeVisible();
    await page.getByRole("button", {name:"显示完整流程",exact:true}).click();
    await page.getByText("查看哪些知识被选用及原因",{exact:true}).click();
    await page.screenshot({
      path: testInfo.outputPath("retrieval-execution.png"),
    });
    await page.getByRole("button", { name: "定位回答", exact: true }).click();
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 3,
    });
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("再确认发布安排");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    await expect(page.getByText("已完成", { exact: true })).toHaveCount(2);
    const second = await last();
    expect(second.snapshot?.request).toEqual(requests[1]);
    expect(second.contextManifest.knowledgeRefs?.[0]?.version).toBe(2);
    const preview = await nativeInvoke<ContextManifest>(
      page,
      "preview_context",
      {
        workspaceId,
        conversationId,
        content: "火星香蕉",
        contextSelection: [],
      },
    );
    expect(preview.retrieval?.status).toBe("no_match");
    await page
      .getByRole("checkbox", { name: "自动查找知识", exact: true })
      .uncheck();
    await expect(
      page.getByRole("checkbox", { name: "自动查找知识", exact: true }),
    ).not.toBeChecked();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("关闭后查询发布");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect.poll(() => requests.length).toBe(3);
    await expect(page.getByText("已完成", { exact: true })).toHaveCount(3);
    const disabled = await last();
    expect(disabled.contextManifest.retrievalUsed).toBe(false);
    expect(disabled.contextManifest.knowledgeRefs).toEqual([]);
    expect(disabled.events.some((e) => e.kind.startsWith("retrieval_"))).toBe(
      false,
    );
    expect(app.consoleErrors).toEqual([]);
    await app.closeWindow();
    await app.stop();
    app = await launchNative(testInfo, { endpoint });
    page = app.page;
    await expect(
      page.getByRole("checkbox", { name: "自动查找知识", exact: true }),
    ).not.toBeChecked();
    expect(
      (
        await nativeInvoke<RunDetail>(page, "get_run", {
          workspaceId,
          runId: first.run.id,
        })
      ).snapshot?.request,
    ).toEqual(first.snapshot?.request);
    await page.getByRole("button", { name: "新建对话", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "自动查找知识", exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: testInfo.outputPath("retrieval-composer.png"),
    });
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
