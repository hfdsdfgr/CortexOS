import { expect, test } from "@playwright/test";
import { createServer, type ServerResponse } from "node:http";
import { writeFile } from "node:fs/promises";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import type { Message } from "../src/studio";

test("native Markdown preview and streaming output preserve source text and citation offsets", async ({}, info) => {
  test.setTimeout(90000);
  let response: ServerResponse | undefined;
  let imageRequests = 0;
  const first = "# 发布安排\n\n**中文🙂** 与 `代码`\n\n```ts\nconst value = ";
  const rest =
    "42; // [资料1]\n```\n\n- 第一项\n- 第二项\n\n> 引用段落\n\n| 项目 | 结果 |\n| --- | --- |\n| 发布 | [资料1] |\n\n**依据[资料1]**\n\n\\*文字\\* &amp; 转义[资料1]\n\n错误[资料9]\n\n<script>window.markdownExecuted=true</script>\n\n[危险链接](javascript:alert(1))\n\n![测试图片](https://example.invalid/private.png)";
  const answer = first + rest;
  const server = createServer(async (req, res) => {
    const json = (value: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/version")
      return json({ version: "markdown-fixture" });
    if (req.url === "/api/tags")
      return json({ models: [{ name: "qwen3:4b-instruct" }] });
    if (req.url === "/api/show") return json({ details: { format: "gguf" } });
    for await (const part of req) void part;
    res.setHeader("Content-Type", "application/x-ndjson");
    response = res;
    res.write(
      JSON.stringify({ message: { content: first }, done: false }) + "\n",
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No fixture port");
  let app = await launchNative(info, {
    endpoint: `http://127.0.0.1:${address.port}`,
  });
  try {
    let page = app.page;
    page.on("request", (request) => {
      if (request.url().includes("private.png")) imageRequests++;
    });
    await createWorkspace(page, "Markdown 验收");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const nodeId = await nativeInvoke<string>(page, "save_knowledge", {
      input: {
        workspaceId,
        nodeId: null,
        expectedRevision: null,
        title: "发布安排",
        kind: "knowledge",
        content: "发布安排：周四发布。",
        changeReason: "合成验收",
        sourceMessageId: null,
        sourceExcerpt: null,
      },
    });
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 1,
    });
    const question = "# 发布安排\n\n请**说明发布安排**。\n\n- 时间\n- 步骤";
    const input = page.getByRole("textbox", { name: "你的问题", exact: true });
    await input.fill(question);
    await page
      .getByRole("button", { name: "预览 Markdown", exact: true })
      .click();
    const preview = page.getByRole("region", {
      name: "Markdown 预览",
      exact: true,
    });
    await expect(
      preview.getByRole("heading", { name: "发布安排", exact: true }),
    ).toBeVisible();
    await expect(preview.locator("strong")).toHaveText("说明发布安排");
    await expect(input).not.toBeVisible();
    await page
      .getByRole("button", { name: "返回 Markdown 编辑", exact: true })
      .click();
    await expect(input).toHaveValue(question);
    await expect(input).toBeFocused();
    await page
      .getByRole("button", { name: "预览 Markdown", exact: true })
      .click();
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(input).toBeVisible();
    await expect(
      page
        .getByRole("article", { name: "你的问题", exact: true })
        .locator("h1"),
    ).toHaveText("发布安排");
    const output = () =>
      page.getByRole("article", { name: "模型回答", exact: true }).last();
    await expect(output().locator("pre code")).toContainText("const value =");
    await expect(output().getByText("生成中", { exact: true })).toBeVisible();
    response!.end(
      JSON.stringify({
        message: { content: rest },
        done: true,
        done_reason: "stop",
      }) + "\n",
    );
    await expect(output().getByText("已完成", { exact: true })).toBeVisible();
    await expect(output().locator("table tbody tr")).toHaveCount(1);
    await expect(output().locator("blockquote")).toHaveText("引用段落");
    await expect(
      output().getByRole("button", {
        name: "[资料1]，查看引用文字",
        exact: true,
      }),
    ).toHaveCount(3);
    await expect(
      output().getByRole("button", { name: "[资料9]，无法定位", exact: true }),
    ).toHaveCount(1);
    await expect(output().locator("pre .answer-citation")).toHaveCount(0);
    await expect(
      output().locator("script,img,a[href^='javascript:']"),
    ).toHaveCount(0);
    expect(await page.evaluate(() => "markdownExecuted" in window)).toBe(false);
    expect(imageRequests).toBe(0);
    const conversationId = (
      await nativeInvoke<{ id: string }[]>(page, "list_conversations", {
        workspaceId,
      })
    )[0].id;
    const saved = await nativeInvoke<Message[]>(page, "load_messages", {
      workspaceId,
      conversationId,
    });
    expect(saved[0].content).toBe(question);
    expect(saved[1].content).toBe(answer);
    expect(saved[1].citations?.references).toHaveLength(1);
    for (const item of saved[1].citations!.occurrences)
      expect(answer.slice(item.start, item.end)).toBe(item.label);
    const citation = output()
      .getByRole("button", { name: "[资料1]，查看引用文字", exact: true })
      .first();
    await citation.click();
    await expect(
      page.getByRole("dialog", { name: "引用文字", exact: true }),
    ).toContainText("周四发布");
    await page.keyboard.press("Escape");
    await expect(citation).toBeFocused();
    await output()
      .getByRole("button", { name: "查看 Markdown 原文", exact: true })
      .click();
    await expect(output().locator(".message-content")).toHaveText(answer);
    await output()
      .getByRole("button", { name: "显示 Markdown 排版", exact: true })
      .click();
    for (const [width, height] of [
      [1366, 768],
      [1600, 900],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await input.fill(
        question + "\n\n| 项目 | 进度 |\n| --- | --- |\n| 中文测试 | 就绪 |",
      );
      await page
        .getByRole("button", { name: "预览 Markdown", exact: true })
        .click();
      await expect(preview.locator("table")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`markdown-${width}.png`) });
      await page
        .getByRole("button", { name: "返回 Markdown 编辑", exact: true })
        .click();
    }
    await input.fill("");
    await page.locator(".message-scroll").evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({ path: info.outputPath("markdown-answer-top.png") });
    await output()
      .locator(".message-content p")
      .first()
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await output()
      .getByRole("button", { name: "保存为知识", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      "跨越了 Markdown 格式标记",
    );
    await page
      .getByRole("button", { name: "关闭错误提示", exact: true })
      .click();
    await page.evaluate(() => window.getSelection()?.removeAllRanges());
    await output()
      .getByRole("button", { name: "查看 Markdown 原文", exact: true })
      .click();
    await output()
      .locator(".message-content")
      .evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
    await output()
      .getByRole("button", { name: "保存为知识", exact: true })
      .click();
    await expect(
      page
        .getByRole("dialog", { name: "新建知识草稿", exact: true })
        .getByLabel("正文", { exact: true }),
    ).toHaveValue(answer);
    expect(app.consoleErrors).toEqual([]);
    await app.stop();
    app = await launchNative(info, {
      endpoint: `http://127.0.0.1:${address.port}`,
    });
    page = app.page;
    await expect(
      page.getByRole("article", { name: "模型回答" }).locator("table"),
    ).toBeVisible();
  } finally {
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
});

test("native focus and switching honor app motion preference with real interpolated camera positions", async ({}, info) => {
  test.setTimeout(60000);
  const app = await launchNative(info);
  try {
    const { page } = app;
    const nativeReducedMotion = await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await createWorkspace(page, "镜头过渡验收");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const { nodeIds } = await seedGraph(page, workspaceId, 2, 1);
    await nativeInvoke(page, "save_graph_view", {
      input: {
        workspaceId,
        expectedRevision: 0,
        camera: [0, 0, 30],
        target: [0, 0, 0],
        positions: nodeIds.map((nodeId, i) => ({
          nodeId,
          position: [i * 5, 0, 0],
        })),
      },
    });
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    const canvas = page.locator('canvas[data-webgl-ready="true"]');
    await expect(canvas).toBeVisible();
    const setMotion = async (value: string) => {
      const legend = page.locator("details.graph-legend");
      await legend.locator("summary").click();
      await page.getByLabel("镜头过渡", { exact: true }).selectOption(value);
      await legend.locator("summary").click();
    };
    await page.locator("details.graph-legend > summary").click();
    await expect(page.getByLabel("镜头过渡", { exact: true })).toHaveValue(
      "smooth",
    );
    await page.locator("details.graph-legend > summary").click();
    const inspector = page.getByRole("complementary", {
      name: "图谱详情",
      exact: true,
    });
    const choose = async (name: RegExp) => {
      await page.getByRole("button", { name: "节点列表", exact: true }).click();
      await page
        .getByRole("complementary", { name: "图谱节点列表", exact: true })
        .getByRole("button", { name })
        .click();
    };
    const started = performance.now();
    await choose(/^中心知识/);
    await page.waitForTimeout(120);
    await expect(inspector).not.toBeVisible();
    const focusMid = (await canvas.getAttribute("data-camera-position"))!
      .split(",")
      .map(Number);
    expect(focusMid[2]).toBeGreaterThan(14.05);
    expect(focusMid[2]).toBeLessThan(29.95);
    await page.screenshot({ path: info.outputPath("camera-in-flight.png") });
    await expect(
      inspector.getByRole("heading", { name: "中心知识", exact: true }),
    ).toBeVisible();
    const focusMs = performance.now() - started;
    expect(focusMs).toBeGreaterThanOrEqual(350);
    const switched = performance.now();
    await choose(/^关联条目 001/);
    await page.waitForTimeout(120);
    await expect(inspector).not.toBeVisible();
    const switchMid = (await canvas.getAttribute("data-camera-position"))!
      .split(",")
      .map(Number);
    expect(switchMid[0]).toBeGreaterThan(0.05);
    expect(switchMid[0]).toBeLessThan(4.95);
    await expect(
      inspector.getByRole("heading", { name: "关联条目 001", exact: true }),
    ).toBeVisible();
    const switchMs = performance.now() - switched;
    expect(switchMs).toBeGreaterThanOrEqual(350);
    await choose(/^中心知识/);
    await page.waitForTimeout(150);
    await choose(/^关联条目 001/);
    await expect(
      inspector.getByRole("heading", { name: "关联条目 001", exact: true }),
    ).toBeVisible();
    await choose(/^中心知识/);
    await page.waitForTimeout(150);
    const bounds = (await canvas.boundingBox())!;
    const dragStart = {
      x: bounds.x + bounds.width * 0.18,
      y: bounds.y + bounds.height * 0.45,
    };
    expect(
      await canvas.evaluate(
        (element, point) =>
          document.elementFromPoint(point.x, point.y) === element,
        dragStart,
      ),
    ).toBe(true);
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + 55, dragStart.y + 25, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(1700);
    await expect(inspector).not.toBeVisible();
    await choose(/^中心知识/);
    await canvas.hover();
    await page.mouse.wheel(0, 100);
    await expect(
      inspector.getByRole("heading", { name: "中心知识", exact: true }),
    ).toBeVisible();
    await page.waitForTimeout(200);
    const count = await canvas.getAttribute("data-render-count");
    await page.waitForTimeout(350);
    expect(await canvas.getAttribute("data-render-count")).toBe(count);
    await page.screenshot({ path: info.outputPath("camera-settled.png") });
    await setMotion("system");
    await choose(/^关联条目 001/);
    await expect(
      inspector.getByRole("heading", { name: "关联条目 001", exact: true }),
    ).toBeVisible({ timeout: 200 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await setMotion("instant");
    await choose(/^中心知识/);
    await expect(
      inspector.getByRole("heading", { name: "中心知识", exact: true }),
    ).toBeVisible({ timeout: 200 });
    await setMotion("smooth");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await choose(/^关联条目 001/);
    await page.waitForTimeout(120);
    await expect(inspector).not.toBeVisible();
    await expect(
      inspector.getByRole("heading", { name: "关联条目 001", exact: true }),
    ).toBeVisible();
    const delayedStart = (await canvas.getAttribute("data-camera-position"))!
      .split(",")
      .map(Number);
    await page.getByRole("button", { name: "节点列表", exact: true }).click();
    await page
      .getByRole("complementary", { name: "图谱节点列表", exact: true })
      .getByRole("button", { name: /^中心知识/ })
      .evaluate((button) => {
        (button as HTMLButtonElement).click();
        // Isolated regression: emulate main-thread work before the first rendered frame.
        const until = performance.now() + 500;
        while (performance.now() < until) {
          /* synthetic test work */
        }
      });
    await page.waitForTimeout(100);
    await expect(inspector).not.toBeVisible();
    const delayedMid = (await canvas.getAttribute("data-camera-position"))!
      .split(",")
      .map(Number);
    expect(delayedMid[0]).toBeLessThan(delayedStart[0] - 0.05);
    expect(delayedMid[0]).toBeGreaterThan(delayedStart[0] - 4.95);
    await expect(
      inspector.getByRole("heading", { name: "中心知识", exact: true }),
    ).toBeVisible();
    await page.locator("details.graph-legend > summary").click();
    for (const [width, height] of [
      [1366, 768],
      [1600, 900],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(page.getByLabel("镜头过渡", { exact: true })).toHaveValue(
        "smooth",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`camera-motion-${width}.png`),
      });
    }
    await page.reload();
    await page.locator("details.graph-legend > summary").click();
    await expect(page.getByLabel("镜头过渡", { exact: true })).toHaveValue(
      "smooth",
    );
    await page.locator("details.graph-legend > summary").click();
    await writeFile(
      info.outputPath("camera-timing.json"),
      JSON.stringify(
        {
          focusMs,
          switchMs,
          duration: 420,
          focusMid,
          switchMid,
          delayedFirstFrameChecked: true,
          delayedMid,
          nativeReducedMotion,
          testedReducedMotion: true,
          note: "UI operation to inspector ready; includes IPC, not pure animation duration",
          idleFrames: 0,
          smoothOverrideChecked: true,
          systemAndInstantChecked: true,
          preferenceReloadChecked: true,
        },
        null,
        2,
      ),
    );
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
