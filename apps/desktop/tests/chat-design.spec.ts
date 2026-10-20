import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { createWorkspace, launchNative } from "./native";

test("reference chat layouts retain compose, streaming, inspection and offline states", async ({}, testInfo) => {
  test.setTimeout(90_000);
  let slow = false;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {
      /* consume fixture request */
    }
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/version")
      return response.end(JSON.stringify({ version: "design-fixture" }));
    if (request.url === "/api/tags")
      return response.end(
        JSON.stringify({
          models: [{ name: "qwen3:4b-instruct", size: 2500000000 }],
        }),
      );
    if (request.url === "/api/show")
      return response.end(JSON.stringify({ details: { format: "gguf" } }));
    response.write(
      JSON.stringify({
        message: {
          role: "assistant",
          content: "先明确目标，再拆分为可验证的任务。",
        },
        done: false,
      }) + "\n",
    );
    if (slow) await new Promise((resolve) => setTimeout(resolve, 2500));
    response.end(
      JSON.stringify({
        message: {
          role: "assistant",
          content: "每次迭代都保存执行记录和使用的上下文。",
        },
        done: true,
        done_reason: "stop",
      }) + "\n",
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture address");
  const app = await launchNative(testInfo, {
    endpoint: `http://127.0.0.1:${address.port}`,
  });
  const { page } = app;
  try {
    await createWorkspace(page, "产品设计");
    await expect(
      page.getByText("Ollama 已连接", { exact: true }),
    ).toBeVisible();
    for (const [width, height] of [
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await page
        .getByRole("textbox", { name: "你的问题", exact: true })
        .fill("如何推进本地认知工作台的下一轮迭代？");
      await expect(
        page.getByRole("button", { name: "发送消息", exact: true }),
      ).toBeEnabled();
      const metrics = await page.evaluate(() => {
        const sidebar = document
          .querySelector("aside.reference-sidebar")!
          .getBoundingClientRect();
        const composer = document
          .querySelector(".composer")!
          .getBoundingClientRect();
        return {
          width: innerWidth,
          height: innerHeight,
          sidebarWidth: sidebar.width,
          composerX: composer.x,
          composerWidth: composer.width,
          composerBottom: composer.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(metrics.overflow).toBe(false);
      expect(metrics.composerBottom).toBeLessThan(height);
      expect(metrics.sidebarWidth).toBe(240);

      await testInfo.attach(`layout-${width}`, {
        body: JSON.stringify(metrics, null, 2),
        contentType: "application/json",
      });
      await page.screenshot({
        path: testInfo.outputPath(`chat-empty-${width}.png`),
      });
    }
    slow = true;
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "停止生成", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("chat-streaming-1920.png"),
    });
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    for (const [width, height] of [
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(
        page.locator(".message.assistant .message-content"),
      ).toContainText("执行记录");
      await page.screenshot({
        path: testInfo.outputPath(`chat-conversation-${width}.png`),
      });
    }
    await page.getByRole("button", { name: "执行过程", exact: true }).click();
    await expect(page.getByRole("heading", { name: "本次回答的处理记录" })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("chat-inspector-1920.png"),
    });
    await page.getByRole("button", { name: "关闭执行详情" }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "打开会话列表" }).click();
    await expect(page.getByRole("dialog", { name: "会话列表" })).toBeVisible();
    await expect(page.getByLabel("当前工作区", { exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "打开会话列表" }),
    ).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("chat-mobile-375.png") });
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await page.setViewportSize({ width: 1366, height: 768 });
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "设置", exact: true })
      .click();
    await page.getByRole("button", { name: "检测连接", exact: true }).click();
    await expect(page.getByText("模型未连接", { exact: true })).toBeVisible();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "对话", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("离线时保留我的草稿");
    await expect(
      page.getByRole("button", { name: "发送消息", exact: true }),
    ).toBeDisabled();
    await page.screenshot({
      path: testInfo.outputPath("chat-offline-1366.png"),
    });
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
