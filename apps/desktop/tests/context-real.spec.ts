import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { launchNative, nativeInvoke, createWorkspace } from "./native";
import type { Message, RunDetail, ModelHealth } from "../src/studio";

test("real local model receives approved knowledge with an immutable request snapshot", async ({}, testInfo) => {
  test.setTimeout(180_000);
  let app = await launchNative(testInfo);
  try {
    let page = app.page;
    const health = await nativeInvoke<ModelHealth>(page, "check_ollama");
    expect(health.models.some((m) => m.name === "qwen3:4b-instruct")).toBe(
      true,
    );
    await createWorkspace(page, "真实知识上下文验收");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const nodeId = await nativeInvoke<string>(page, "save_knowledge", {
      input: {
        workspaceId,
        nodeId: null,
        expectedRevision: null,
        title: "测试项目代号",
        kind: "knowledge",
        content: "本次验收项目的代号为青鹭-742，发布时间是周四。",
        changeReason: "测试夹具",
        sourceMessageId: null,
        sourceExcerpt: null,
      },
    });
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 1,
    });
    await page.getByText("本次上下文：0 项知识", { exact: true }).click();
    await page.getByRole("button", { name: "刷新知识列表" }).click();
    await page.getByRole("checkbox", { name: /测试项目代号/ }).check();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("请根据本次参考资料，用一句话说出验收项目代号和发布时间。");
    const started = Date.now();
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByText("已完成", { exact: true })).toBeVisible({
      timeout: 150_000,
    });
    const conversationId = (
      await nativeInvoke<{ id: string }[]>(page, "list_conversations", {
        workspaceId,
      })
    )[0].id;
    const answer = (
      await nativeInvoke<Message[]>(page, "load_messages", {
        workspaceId,
        conversationId,
      })
    ).at(-1)!;
    const detail = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId: answer.modelRunId,
    });
    expect(answer.content.length).toBeGreaterThan(0);
    expect(detail.contextManifest.knowledgeRefs?.[0]).toMatchObject({
      nodeId,
      version: 1,
    });
    expect(JSON.stringify(detail.snapshot?.request.messages)).toContain(
      "青鹭-742",
    );
    expect(detail.events.at(-1)?.kind).toBe("response_completed");
    await page.getByRole("button", { name: "执行过程", exact: true }).click();
    await page.getByText("测试项目代号 · 本次使用 v1", { exact: true }).click();
    await page
      .getByText("测试项目代号 · 本次使用 v1", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("native-real-context.png"),
    });
    await writeFile(
      testInfo.outputPath("real-context-observation.json"),
      JSON.stringify(
        {
          providerVersion: health.version,
          model: detail.run.modelId,
          status: detail.run.status,
          wallMs: Date.now() - started,
          answer: answer.content,
          knowledgeVersion: 1,
          requestHash: detail.snapshot?.requestHash,
          events: detail.events.map((e) => e.kind),
        },
        null,
        2,
      ),
    );
    await page.getByRole("button", { name: "关闭执行详情" }).click();
    await page
      .getByRole("button", { name: "3D 执行轨迹", exact: true })
      .click();
    await expect(
      page.locator('canvas[data-webgl-ready="true"]'),
    ).toHaveAttribute("aria-label", "3D 执行画布");
    await page
      .getByRole("button", { name: "测试项目代号 · v1", exact: true })
      .click();
    await expect(page.getByLabel("执行节点详情")).toContainText("青鹭-742");
    await page.getByRole("button", { name: "适应执行图", exact: true }).click();
    await page.screenshot({
      path: testInfo.outputPath("native-real-execution-trace.png"),
    });
    await app.closeWindow();
    await app.stop();
    app = await launchNative(testInfo);
    page = app.page;
    expect(
      (
        await nativeInvoke<RunDetail>(page, "get_run", {
          workspaceId,
          runId: answer.modelRunId,
        })
      ).snapshot,
    ).toEqual(detail.snapshot);
  } finally {
    await app.stop();
  }
});
