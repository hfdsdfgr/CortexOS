import { test, expect } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { createWorkspace, launchNative, nativeInvoke } from "./native";

test("HTML reference layout retains real evidence, themes, streaming continuity and responsive navigation", async ({}, info) => {
  test.setTimeout(120_000);
  let response: ServerResponse | undefined;
  const server = createServer(async (request, res) => {
    for await (const chunk of request) void chunk;
    res.setHeader("Content-Type", "application/json");
    if (request.url === "/api/version") return res.end(JSON.stringify({ version: "controlled-ui-check" }));
    if (request.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: "qwen3:4b-instruct", details: { format: "gguf" } }] }));
    if (request.url === "/api/show") return res.end(JSON.stringify({ details: { format: "gguf" } }));
    response = res;
    res.setHeader("Content-Type", "application/x-ndjson");
    res.write(JSON.stringify({ message: { role: "assistant", content: "## 项目推进建议\n\n先明确目标与验收范围，保留每次讨论中使用的资料与决定。" }, done: false }) + "\n");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing fixture port");
  const app = await launchNative(info, { endpoint: `http://127.0.0.1:${address.port}` });
  const { page } = app;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width: 1600, height: 900 });
    await createWorkspace(page, "项目研究室");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const ids: string[] = [];
    for (const [title, content] of [["项目推进约定", "项目每周四评审，先确认目标与完成标准，再推进下一阶段。"], ["项目资料管理", "项目资料保留原始出处和明确版本，确认后再用于回答。"], ["项目技术选择", "项目使用本机模型，知识与执行记录保持分别可查。"]]) {
      const nodeId = await nativeInvoke<string>(page, "save_knowledge", { input: { workspaceId, nodeId: null, expectedRevision: null, title, kind: "knowledge", content, changeReason: "界面检查合成资料", sourceMessageId: null, sourceExcerpt: null } });
      await nativeInvoke(page, "approve_knowledge", { workspaceId, nodeId, expectedRevision: 1 });
      ids.push(nodeId);
    }
    await page.getByRole("combobox", { name: "外观", exact: true }).selectOption("light");
    await page.getByText("手动选择：0 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "刷新知识列表", exact: true }).click();
    for (const title of ["项目推进约定", "项目资料管理", "项目技术选择"]) await page.getByRole("checkbox", { name: new RegExp(title) }).check();
    await page.getByText("手动选择：3 项知识", { exact: true }).click();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.getByRole("textbox", { name: "你的问题", exact: true }).fill("请结合项目约定，整理项目推进与资料管理建议。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    const fragments = page.locator(".message.assistant .stream-fragment");
    await expect(fragments.first()).toBeVisible();
    const motion = await fragments.first().evaluate(element => {
      element.setAttribute("data-continuity-check", "original");
      return { animation: getComputedStyle(element).animationName, filter: getComputedStyle(element).filter };
    });
    expect(motion.animation).toBe("text-bloom");
    response!.write(JSON.stringify({ message: { role: "assistant", content: "确认资料后再决定任务顺序，每一步都可回查依据。" }, done: false }) + "\n");
    await expect(page.locator(".message.assistant .message-content")).toContainText("每一步都可回查依据");
    await expect(fragments.first()).toHaveAttribute("data-continuity-check", "original");
    response!.end(JSON.stringify({ message: { role: "assistant", content: "\n\n- 明确范围与优先级\n- 保存知识与版本\n- 对照资料检查回答 [资料1]" }, done: true, done_reason: "stop" }) + "\n");
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    await expect(page.locator(".chat-evidence .evidence-reference")).toHaveCount(3);
    await expect(page.locator(".toast")).toHaveCount(0, { timeout: 3500 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const scheme of ["light", "dark"] as const) {
      await page.getByRole("combobox", { name: "外观", exact: true }).selectOption(scheme);
      for (const [width, height] of [[1366,768], [1600,900], [1920,1080]]) {
        await page.setViewportSize({ width, height });
        for (const route of ["chat", "knowledge", "graph", "settings"]) {
          await page.goto(`http://tauri.localhost/#/${route}?workspace=${workspaceId}${route === "knowledge" ? `&node=${ids[0]}` : ""}`);
          if (route === "chat") await expect(page.locator(".evidence-reference")).toHaveCount(3);
          if (route === "knowledge") await expect(page.locator(".knowledge-prose").first()).toContainText("每周四");
          if (route === "graph") await expect(page.locator('canvas[data-webgl-ready="true"]')).toBeVisible();
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.screenshot({ path: info.outputPath(`${route}-${scheme}-${width}.png`) });
        }
      }
    }
    await page.getByRole("combobox", { name: "外观", exact: true }).selectOption("light");
    await page.reload();
    await expect(page.getByRole("combobox", { name: "外观", exact: true })).toHaveValue("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await page.getByRole("combobox", { name: "外观", exact: true }).selectOption("system");
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "dark");
    await page.emulateMedia({ colorScheme: "light" });
    await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
    for (const width of [800, 375]) {
      await page.setViewportSize({ width, height: 812 });
      await page.getByRole("button", { name: "打开导航", exact: true }).click();
      const drawer = page.getByRole("dialog", { name: "导航与会话" });
      await expect(drawer).toBeVisible();
      await drawer.getByRole("link", { name: "对话", exact: true }).click();
      await expect(drawer).not.toBeVisible();
      await page.getByRole("button", { name: "打开回答依据", exact: true }).click();
      await expect(page.getByRole("complementary", { name: "回答依据" })).toBeVisible();
      await page.getByRole("button", { name: "收起回答依据", exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`narrow-${width}.png`) });
    }
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.locator(".message.assistant").getByRole("button", { name: "复制", exact: true }).click();
    await expect(page.locator(".toast")).toHaveText("回答已复制");
    await expect(page.locator(".toast")).toHaveCount(0, { timeout: 3500 });
    await info.attach("presentation-evidence", { body: JSON.stringify({ motion, errors, sizes: [1366,1600,1920], schemes: ["light","dark"], narrow: [800,375], realKnowledgeReferences: 3, contextData: "actual persisted request, not prototype data", toastTimeoutMs: 2500 }), contentType: "application/json" });
    expect(errors).toEqual([]);
  } finally {
    response?.end();
    await app.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
