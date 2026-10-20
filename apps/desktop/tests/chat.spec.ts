import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import type { Bootstrap, Message, RunDetail } from "../src/studio";

test("native chat preserves real SQLite data through cancellation, errors and restart", async ({}, testInfo) => {
  test.setTimeout(150_000);
  let mode = "complete";
  const requests: Record<string, unknown>[] = [];
  const server = createServer(async (request, response) => {
    const json = (value: unknown, status = 200) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(value));
    };
    if (request.url === "/api/version")
      return json({ version: "test-fixture" }, mode === "offline" ? 503 : 200);
    if (request.url === "/api/tags")
      return json({
        models: [
          {
            name: "qwen3:4b-instruct",
            size: 2500000000,
            details: { parameter_size: "4B", quantization_level: "Q4_K_M" },
          },
        ],
      });
    if (request.url === "/api/show")
      return json(
        mode === "remote"
          ? {
              remote_host: "https://example.invalid",
              details: { format: "gguf" },
            }
          : { details: { format: "gguf" } },
        mode === "missing" ? 404 : 200,
      );
    if (request.url !== "/api/chat") return json({}, 404);
    let body = "";
    for await (const chunk of request) body += chunk.toString();
    requests.push(JSON.parse(body));
    if (mode === "hang") return;
    response.writeHead(200, { "Content-Type": "application/x-ndjson" });
    const frame = (content: string, done = false) =>
      JSON.stringify({
        message: { role: "assistant", content },
        done,
        done_reason: done
          ? mode === "limited"
            ? "length"
            : "stop"
          : undefined,
        eval_count: done ? 8 : undefined,
      }) + "\n";
    if (mode === "slow") {
      response.write(frame("已经生成的部分内容"));
      const timer = setInterval(() => response.write(frame("，继续生成")), 800);
      response.on("close", () => clearInterval(timer));
      return;
    }
    if (mode === "malformed") {
      response.end(frame("格式错误前的有效内容") + "{invalid-json}\n");
      return;
    }
    const bytes = Buffer.from(frame("用于回归检查的完整回答。", true));
    const split = bytes.indexOf(Buffer.from("回")) + 1;
    response.write(bytes.subarray(0, split));
    setTimeout(() => response.end(bytes.subarray(split)), 30);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("No fixture port");
  const endpoint = `http://127.0.0.1:${address.port}`;
  let application = await launchNative(testInfo, { endpoint });
  try {
    let { page } = application;
    await expect(
      page.getByText("Ollama 已连接", { exact: true }),
    ).toBeVisible();
    await createWorkspace(page, "回归项目 A");
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("常规问题");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page.getByText("用于回归检查的完整回答。", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    expect(requests[0].stream).toBe(true);
    expect(requests[0].think).toBe(false);
    expect(requests[0].options).toMatchObject({
      num_ctx: 4096,
      num_predict: 512,
    });
    expect(
      (requests[0].options as { temperature: number }).temperature,
    ).toBeCloseTo(0.3);
    await page.getByRole("button", { name: "重命名会话" }).click();
    const rename = page.getByRole("dialog", {
      name: "重命名会话",
      exact: true,
    });
    await rename.getByLabel("会话名称").fill("保留的会话");
    await rename.getByRole("button", { name: "保存名称" }).click();
    await expect(rename).not.toBeVisible();
    const initial = await nativeInvoke<Bootstrap>(page, "bootstrap");
    const workspaceA = initial.workspaces[0].id;
    const conversations = await nativeInvoke<{ id: string }[]>(
      page,
      "list_conversations",
      { workspaceId: workspaceA },
    );
    const conversationA = conversations[0].id;

    mode = "slow";
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("停止测试");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page
        .getByRole("article", { name: "模型回答" })
        .last()
        .locator(".message-content"),
    ).toContainText("已经生成的部分内容");
    await createWorkspace(page, "回归项目 B");
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("B 的草稿不能串到 A");
    await expect(
      page.getByRole("button", { name: "发送消息", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByText("已经生成的部分内容", { exact: true }),
    ).not.toBeVisible();
    const workspaceB = (
      await nativeInvoke<Bootstrap>(page, "bootstrap")
    ).workspaces.find((workspace) => workspace.name === "回归项目 B")!.id;
    await expect(
      nativeInvoke(page, "load_messages", {
        workspaceId: workspaceB,
        conversationId: conversationA,
      }),
    ).rejects.toThrow(/不属于当前工作区/);
    await page.getByRole("button", { name: "前往生成中的会话" }).click();
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect(page.getByText("已停止", { exact: true })).toBeVisible();
    const messages = await nativeInvoke<Message[]>(page, "load_messages", {
      workspaceId: workspaceA,
      conversationId: conversationA,
    });
    const cancelled = messages.at(-1)!;
    expect(cancelled.content).toContain("已经生成的部分内容");
    expect(cancelled.status).toBe("cancelled");
    const cancelledRun = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId: workspaceA,
      runId: cancelled.modelRunId,
    });
    expect(cancelledRun.events.map((event) => event.kind)).toEqual([
      "request_received",
      "retrieval_started",
      "retrieval_completed",
      "context_prepared",
      "model_inspection_started",
      "model_inspection_completed",
      "model_request_started",
      "model_response_received",
      "run_cancelled",
    ]);
    await expect(
      nativeInvoke(page, "get_run", {
        workspaceId: workspaceB,
        runId: cancelled.modelRunId,
      }),
    ).rejects.toThrow(/不属于当前工作区/);

    mode = "malformed";
    await page
      .getByRole("button", { name: "新建对话", exact: true })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("格式错误测试");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByText("生成失败", { exact: true })).toBeVisible();
    await expect(
      page.getByText("格式错误前的有效内容", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("格式异常");
    mode = "complete";
    await page.getByRole("button", { name: "重试", exact: true }).click();
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    expect(
      (requests.at(-1)!.messages as { role: string; content: string }[]).filter(
        (message) => message.content === "格式错误测试",
      ),
    ).toHaveLength(1);
    mode = "slow";
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("正常关闭时保存");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page
        .getByRole("article", { name: "模型回答" })
        .last()
        .locator(".message-content"),
    ).toContainText("已经生成的部分内容");
    const closingRun = (await nativeInvoke<Bootstrap>(page, "bootstrap"))
      .activeRun!;
    await application.closeWindow();
    await application.stop();
    application = await launchNative(testInfo, { endpoint });
    page = application.page;
    const closedRun = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId: closingRun.workspaceId,
      runId: closingRun.id,
    });
    expect(closedRun.run.status).toBe("cancelled");
    expect(closedRun.events.at(-1)!.kind).toBe("run_cancelled");
    expect(
      (
        await nativeInvoke<Message[]>(page, "load_messages", {
          workspaceId: closingRun.workspaceId,
          conversationId: closingRun.conversationId,
        })
      ).at(-1)!.content,
    ).toContain("已经生成的部分内容");
    const dismissError = page.getByRole("button", { name: "关闭错误提示" });
    if (await dismissError.count()) await dismissError.click();

    mode = "slow";
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("崩溃恢复");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page
        .getByRole("article", { name: "模型回答" })
        .last()
        .locator(".message-content"),
    ).toContainText("已经生成的部分内容");
    let running = (await nativeInvoke<Bootstrap>(page, "bootstrap")).activeRun!;
    await expect
      .poll(
        async () =>
          (
            await nativeInvoke<Message[]>(page, "load_messages", {
              workspaceId: running.workspaceId,
              conversationId: running.conversationId,
            })
          ).at(-1)!.content,
      )
      .toContain("已经生成的部分内容");
    await application.stop();
    application = await launchNative(testInfo, { endpoint });
    page = application.page;
    await expect(page.getByText("生成中断", { exact: true })).toBeVisible();
    const recovered = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId: running.workspaceId,
      runId: running.id,
    });
    expect(recovered.run.status).toBe("interrupted");
    expect(recovered.events.at(-1)!.kind).toBe("run_interrupted");
    expect(
      recovered.events.filter((event) => event.kind === "run_interrupted"),
    ).toHaveLength(1);
    await page
      .getByRole("button", { name: "执行过程", exact: true })
      .last()
      .click();
    await expect(page.getByRole("dialog", { name: "本次回答的处理记录" })).toContainText(
      "恢复中断记录",
    );
    await page.getByRole("button", { name: "关闭执行详情" }).click();

    mode = "remote";
    const callsBeforeBlocked = requests.length;
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("云模型必须被阻止");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("已阻止云端模型");
    expect(requests).toHaveLength(callsBeforeBlocked);
    mode = "missing";
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("模型未下载完整");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("模型已完整下载");
    expect(requests).toHaveLength(callsBeforeBlocked);
    await page.getByRole("button", { name: "关闭错误提示" }).click();

    mode = "offline";
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "设置", exact: true })
      .click();
    await page.getByRole("button", { name: "检测连接", exact: true }).click();
    await expect(
      page.getByText("未连接本地 Ollama", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("接口不可用");
    mode = "complete";
    await page.getByRole("button", { name: "检测连接", exact: true }).click();
    await expect(
      page.getByText("Ollama test-fixture 已连接", { exact: true }),
    ).toBeVisible();
    await page.getByText("生成参数", { exact: true }).click();
    await page.getByLabel("生成超时（秒）").fill("30");
    await page.getByRole("button", { name: "保存设置", exact: true }).click();
    await expect(page.getByText("设置已保存", { exact: true })).toBeVisible();
    mode = "hang";
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "对话", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("超时测试");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("超时", {
      timeout: 40_000,
    });
    await expect(
      page.getByRole("button", { name: "停止生成", exact: true }),
    ).not.toBeVisible();
    expect(application.consoleErrors).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("native-failure-recovery.png"),
    });
    mode = "limited";
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("输出上限测试");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page.getByText("已达到输出上限", { exact: false }),
    ).toBeVisible();
    mode = "complete";
    const callsBeforeLimitRetry = requests.length;
    const answersBeforeLimitRetry = await page
      .getByRole("article", { name: "模型回答" })
      .count();
    await page
      .getByRole("article", { name: "模型回答" })
      .last()
      .getByRole("button", { name: "重试", exact: true })
      .click();
    await expect.poll(() => requests.length).toBe(callsBeforeLimitRetry + 1);
    await expect(page.getByRole("article", { name: "模型回答" })).toHaveCount(
      answersBeforeLimitRetry + 1,
    );
    await expect(
      page
        .getByRole("article", { name: "模型回答" })
        .last()
        .getByText("已完成", { exact: true }),
    ).toBeVisible();
    expect(
      (requests.at(-1)!.messages as { content: string }[]).filter(
        (message) => message.content === "输出上限测试",
      ),
    ).toHaveLength(1);
  } finally {
    await application.stop();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
