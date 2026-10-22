import { expect, test, type Locator } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { launchNative, createWorkspace, nativeInvoke } from "./native";
import type { KnowledgeDetail } from "../src/Knowledge";

async function scrollBody(panel: Locator) {
  const header = panel.locator(":scope > .panel-header, :scope > form > .panel-header");
  const body = panel.locator(":scope > .panel-body, :scope > form > .panel-body");
  const before = await header.boundingBox();
  const top = await body.evaluate(element => { element.scrollTop = element.scrollHeight; return element.scrollTop; });
  expect(top).toBeGreaterThan(0);
  expect((await header.boundingBox())!.y).toBe(before!.y);
}

test("native long records, history, editors and source menus keep all controls available", async ({}, info) => {
  test.setTimeout(120_000);
  await mkdir(info.outputPath("data"), { recursive: true });
  const sourcePath = info.outputPath("data", "界面检查资料.md");
  await writeFile(sourcePath, "# 界面检查资料\n" + Array.from({ length: 220 }, (_, i) => `第 ${i + 1} 行：这是隔离检查用的文件文字。`).join("\n"));
  const server = createServer(async (req, res) => {
    for await (const chunk of req) void chunk;
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/version") return res.end(JSON.stringify({ version: "ui-usability-fixture" }));
    if (req.url === "/api/tags") return res.end(JSON.stringify({ models: [{ name: "qwen3:4b-instruct", details: { format: "gguf" } }] }));
    if (req.url === "/api/show") return res.end(JSON.stringify({ details: { format: "gguf" } }));
    res.end(JSON.stringify({ message: { role: "assistant", content: "## 检查结果\n\n这是界面验收的合成回答，使用资料 [资料1]。" }, done: true }) + "\n");
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No model fixture port");
  const app = await launchNative(info, { endpoint: `http://127.0.0.1:${address.port}`, sourcePath }).catch(async error => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    throw error;
  });
  const { page } = app;
  try {
    page.setDefaultTimeout(10_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1366, height: 768 });
    await createWorkspace(page, "界面易用性检查");
    const workspaceId = await page.getByLabel("当前工作区", { exact: true }).inputValue();
    const content = "界面检查资料。\n" + "保留来源和版本，确认后再用于回答。\n".repeat(18);
    const nodeId = await nativeInvoke<string>(page, "save_knowledge", { input: { workspaceId, nodeId: null, expectedRevision: null, title: "界面检查资料", kind: "knowledge", content, changeReason: "合成界面检查资料", sourceMessageId: null, sourceExcerpt: null } });
    await nativeInvoke(page, "approve_knowledge", { workspaceId, nodeId, expectedRevision: 1 });
    await page.getByText("手动选择：0 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "刷新知识列表", exact: true }).click();
    await page.getByRole("checkbox", { name: /界面检查资料/ }).check();
    await page.getByText("手动选择：1 项知识", { exact: true }).click();
    await page.getByRole("textbox", { name: "你的问题", exact: true }).fill("结合界面检查资料回答。");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.locator(".message.assistant .message-content")).toContainText("界面验收");
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "执行过程", exact: true }).last().click();
    const run = page.getByRole("dialog", { name: "本次回答的处理记录", exact: true });
    await expect(run.locator(".execution-timeline")).toBeVisible();
    await scrollBody(run);
    await page.screenshot({ path: info.outputPath("run-scrolled-light-1366.png") });
    await run.getByRole("button", { name: "关闭执行详情", exact: true }).click();
    await page.locator(".answer-citation").first().click();
    const citation = page.getByRole("dialog", { name: "引用文字", exact: true });
    await citation.locator("details").evaluateAll(elements => elements.forEach(element => (element as HTMLDetailsElement).open = true));
    await scrollBody(citation);
    await citation.getByRole("button", { name: "关闭引用文字", exact: true }).click();

    for (let version = 2; version <= 12; version++) {
      const detail = await nativeInvoke<KnowledgeDetail>(page, "get_knowledge", { workspaceId, nodeId });
      await nativeInvoke(page, "save_knowledge", { input: { workspaceId, nodeId, expectedRevision: detail.node.revision, title: "界面检查资料", kind: "knowledge", content: `${content}\n检查版本 ${version}`, changeReason: `合成版本 ${version}`, sourceMessageId: null, sourceExcerpt: null } });
    }
    await page.goto(`http://tauri.localhost/#/knowledge?workspace=${workspaceId}&node=${nodeId}`);
    await page.getByRole("button", { name: "版本历史", exact: true }).click();
    const history = page.getByRole("dialog", { name: "版本历史", exact: true });
    await expect(history.getByText("12 个版本", { exact: true })).toBeVisible();
    await scrollBody(history);
    await page.screenshot({ path: info.outputPath("history-scrolled-1366.png") });
    await history.getByRole("button", { name: "关闭版本历史", exact: true }).click();
    await page.getByRole("button", { name: "修改草稿", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "修改知识草稿", exact: true });
    const kind = editor.getByLabel("类型", { exact: true });
    await kind.click();
    const menu = page.getByRole("listbox");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).not.toBeVisible();
    await expect(editor).toBeVisible();
    await kind.click();
    await page.getByRole("listbox").getByRole("option", { name: "假设", exact: true }).click();
    await expect(kind).toHaveValue("hypothesis");
    await editor.getByLabel("正文", { exact: true }).evaluate(element => element.style.height = "600px");
    const footer = editor.locator(".panel-footer"), footerBefore = await footer.boundingBox();
    await scrollBody(editor);
    expect((await footer.boundingBox())!.y).toBe(footerBefore!.y);
    await page.screenshot({ path: info.outputPath("editor-fixed-actions-1366.png") });
    await editor.getByRole("button", { name: "关闭知识编辑", exact: true }).click();
    const leaving = page.getByRole("dialog", { name: "保留未保存的修改？", exact: true });
    await expect(leaving).toBeVisible();
    await leaving.getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(kind).toHaveValue("hypothesis");
    await editor.getByRole("button", { name: "关闭知识编辑", exact: true }).click();
    await leaving.getByRole("button", { name: "放弃修改", exact: true }).click();

    await page.getByRole("button", { name: "资料文件", exact: true }).click();
    await page.getByRole("button", { name: "添加文件", exact: true }).click();
    const sources = page.getByRole("dialog", { name: "资料文件", exact: true });
    await sources.locator("details").first().evaluate(element => (element as HTMLDetailsElement).open = true);
    await page.setViewportSize({ width: 1366, height: 600 });
    await expect.poll(async () => { const box = await sources.boundingBox(); return box ? box.y + box.height : Infinity; }).toBeLessThanOrEqual(600);
    const sourceFooter = sources.locator(".panel-footer"), sourceBefore = await sourceFooter.boundingBox();
    await sources.locator(".source-text").evaluate(element => element.scrollTop = element.scrollHeight);
    await scrollBody(sources);
    expect((await sourceFooter.boundingBox())!.y).toBe(sourceBefore!.y);
    await sources.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(sources.getByLabel("文件版本", { exact: true })).toHaveValue("1");
    await sources.getByLabel("文件版本", { exact: true }).click();
    await expect(page.getByRole("listbox", { name: "文件版本选项", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sources).toBeVisible();
    await sources.getByRole("button", { name: "关闭资料文件", exact: true }).click();

    await page.goto(`http://tauri.localhost/#/chat?workspace=${workspaceId}`);
    const appearance = page.getByRole("combobox", { name: "外观", exact: true });
    for (const theme of ["light", "dark"]) {
      await appearance.selectOption(theme);
      for (const [width, height] of [[1366, 768], [1600, 900], [1920, 1080]]) {
        await page.setViewportSize({ width, height });
        await appearance.click();
        await expect(page.getByRole("listbox", { name: "外观选项", exact: true })).toBeVisible();
        await page.screenshot({ path: info.outputPath(`native-menu-${theme}-${width}.png`) });
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "查看完整处理记录", exact: false }).click();
        await scrollBody(run);
        await page.screenshot({ path: info.outputPath(`native-run-${theme}-${width}.png`) });
        await run.getByRole("button", { name: "关闭执行详情", exact: true }).click();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    }
    expect(app.consoleErrors).toEqual([]);
    await info.attach("scope", { body: "Actual WebView2 with isolated database, synthetic model service and explicitly selected test file. No personal workspace or actual model output used.", contentType: "text/plain" });
  } finally {
    await app.stop();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
