import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import type { Conversation, Message, RunDetail } from "../src/studio";

test("answer citations use exact run inputs, flag bad locations and preserve historical evidence", async ({}, info) => {
  test.setTimeout(120000);
  const directory = info.outputPath("data");
  await mkdir(directory, { recursive: true });
  const file = join(directory, "release.md");
  const original = "# 发布安排\n发布定于周四。\n发布定于周四。";
  await writeFile(file, original);
  const answer =
    "中文🙂发布按计划[资料1:2-2]。\n全文[资料1]，另一处相同文字[资料1:3-3]。\n未选资料[资料2]，越界[资料1:9-9]，错写[资料1:0-1]。\n未完成[资料1";
  const requests: unknown[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/version")
      return res.end(JSON.stringify({ version: "citation-fixture" }));
    if (req.url === "/api/tags")
      return res.end(
        JSON.stringify({ models: [{ name: "qwen3:4b-instruct" }] }),
      );
    if (req.url === "/api/show")
      return res.end(JSON.stringify({ details: { format: "gguf" } }));
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.setHeader("Content-Type", "application/x-ndjson");
    if (requests.length === 3) {
      res.write(
        JSON.stringify({
          message: { content: "部分回答🙂[资料1:2-2]" },
          done: false,
        }) + "\n",
      );
      return;
    }
    res.end(
      JSON.stringify({
        message: {
          content: requests.length === 1 ? answer : "这次没有标明引用。",
        },
        done: true,
        done_reason: "stop",
      }) + "\n",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("port");
  const endpoint = `http://127.0.0.1:${address.port}`;
  let app = await launchNative(info, { endpoint, sourcePath: file });
  try {
    let page = app.page;
    await createWorkspace(page, "回答引用验收");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const preview = await nativeInvoke<{ ticket: string }>(
      page,
      "choose_source",
      { workspaceId },
    );
    const saved = await nativeInvoke<{ id: string }>(page, "commit_source", {
      workspaceId,
      ticket: preview.ticket,
    });
    const input = {
      workspaceId,
      nodeId: null,
      expectedRevision: null,
      title: "项目发布安排",
      kind: "knowledge",
      content: original,
      changeReason: "导入文件文字",
      sourceMessageId: null,
      sourceExcerpt: null,
    };
    const nodeId = await nativeInvoke<string>(page, "save_source_knowledge", {
      input,
      source: { sourceId: saved.id, version: 1, startLine: 1, endLine: 3 },
    });
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 1,
    });
    const unused = await nativeInvoke<string>(page, "save_knowledge", {
      input: { ...input, title: "未选用的资料", content: "无关内容" },
    });
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId: unused,
      expectedRevision: 1,
    });
    await page
      .getByRole("checkbox", { name: "自动查找知识", exact: true })
      .uncheck();
    await page.getByText("手动选择：0 项知识", { exact: true }).click();
    await page
      .getByRole("button", { name: "刷新知识列表", exact: true })
      .click();
    await page.getByRole("checkbox", { name: /项目发布安排/ }).check();
    await page.getByText("手动选择：1 项知识", { exact: true }).click();
    const send = async (question: string) => {
      await page
        .getByRole("textbox", { name: "你的问题", exact: true })
        .fill(question);
      await page.getByRole("button", { name: "发送消息", exact: true }).click();
    };
    await send("何时发布？");
    await expect(page.getByText("已完成", { exact: true })).toHaveCount(1);
    const conversationId = (
      await nativeInvoke<Conversation[]>(page, "list_conversations", {
        workspaceId,
      })
    )[0].id;
    const messages = () =>
      nativeInvoke<Message[]>(page, "load_messages", {
        workspaceId,
        conversationId,
      });
    const first = (await messages()).at(-1)!;
    expect(first.content).toBe(answer);
    expect(first.citations?.occurrences).toHaveLength(7);
    expect(
      first.citations?.occurrences.filter((item) => item.error),
    ).toHaveLength(4);
    expect(first.citations?.references).toHaveLength(1);
    expect(first.citations?.references[0]).toMatchObject({
      nodeId,
      version: 1,
      citationId: "资料1",
      content: original,
    });
    for (const item of first.citations!.occurrences)
      expect(answer.slice(item.start, item.end)).toBe(item.label);
    const detail = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId: first.modelRunId,
    });
    expect(detail.snapshot?.request).toEqual(requests[0]);
    expect(detail.contextManifest.knowledgeRefs).toEqual(
      first.citations?.references,
    );
    expect(
      detail.events.filter((event) => event.kind === "citations_checked"),
    ).toHaveLength(1);
    expect(
      detail.events.find((event) => event.kind === "citations_checked")
        ?.payload,
    ).toEqual(first.citations);
    const citation = () =>
      page
        .getByRole("button", { name: "[资料1:2-2]，查看引用文字", exact: true })
        .first();
    await citation().click();
    const drawer = () =>
      page.getByRole("dialog", { name: "引用文字", exact: true });
    await expect(drawer()).toContainText("知识 v1，第 2–2 行");
    await expect(drawer().locator(".citation-line[data-selected]")).toHaveCount(
      1,
    );
    await expect(
      drawer().locator(".citation-line[data-selected]"),
    ).toContainText("2发布定于周四。");
    for (const [width, height] of [
      [1366, 768],
      [1600, 900],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const bounds = await drawer().boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      await page.screenshot({ path: info.outputPath(`citation-${width}.png`) });
    }
    await page.keyboard.press("Escape");
    await expect(citation()).toBeFocused();
    await page
      .getByRole("button", { name: "[资料2]，无法定位", exact: true })
      .click();
    await expect(drawer().getByRole("alert")).toContainText(
      "本次发给模型的资料中没有这个编号",
    );
    await page.keyboard.press("Escape");
    await citation().click();
    await drawer()
      .getByRole("button", { name: "查看这个知识版本", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "项目发布安排", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "返回回答", exact: true }).click();
    await expect(page.locator(`#message-${first.id}`)).toBeFocused();
    await page
      .locator(`#message-${first.id}`)
      .getByRole("button", { name: "3D 执行轨迹", exact: true })
      .click();
    await page.getByRole("button", { name: /检查引用位置/ }).click();
    await expect(page.getByLabel("执行节点详情")).toContainText(
      "没有核实回答内容是否正确",
    );
    await page.getByRole("button", { name: "定位回答", exact: true }).click();
    await send("再次确认");
    await expect(
      page.getByText("这条回答没有标明资料引用。", { exact: true }),
    ).toBeVisible();
    await send("生成一段可以停止的回答");
    await expect(
      page.getByText("部分回答🙂[资料1:2-2]", { exact: true }),
    ).toBeVisible();
    expect((await messages()).at(-1)!.citations).toBeNull();
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect
      .poll(async () => (await messages()).at(-1)!.status)
      .toBe("cancelled");
    expect(
      (await messages()).at(-1)!.citations?.occurrences[0].referenceId,
    ).toBe("资料1");
    // Later revisions and file revocation must never rebind an older citation.
    await nativeInvoke(page, "save_knowledge", {
      input: {
        ...input,
        nodeId,
        expectedRevision: 2,
        content: "修改后：发布定于周五。",
        changeReason: "修订安排",
      },
    });
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: 3,
    });
    await writeFile(file, "新的文件内容：周六。");
    const updated = await nativeInvoke<{ ticket: string }>(
      page,
      "choose_source",
      { workspaceId },
    );
    const sourceV2 = await nativeInvoke<{ revision: number }>(
      page,
      "commit_source",
      { workspaceId, ticket: updated.ticket },
    );
    await nativeInvoke(page, "revoke_source", {
      workspaceId,
      sourceId: saved.id,
      expectedRevision: sourceV2.revision,
    });
    const other = await nativeInvoke<{ id: string }>(page, "create_workspace", {
      name: "隔离工作区",
    });
    await expect(
      nativeInvoke(page, "get_run", {
        workspaceId: other.id,
        runId: first.modelRunId,
      }),
    ).rejects.toThrow();
    await expect(
      nativeInvoke(page, "get_source", {
        workspaceId: other.id,
        sourceId: saved.id,
        version: 1,
      }),
    ).rejects.toThrow();
    expect(app.consoleErrors).toEqual([]);
    await app.closeWindow();
    await app.stop();
    app = await launchNative(info, { endpoint, sourcePath: file });
    page = app.page;
    await page.evaluate(
      ({ workspaceId, conversationId, id }) => {
        location.hash = `/chat?workspace=${workspaceId}&conversation=${conversationId}&message=${id}`;
      },
      { workspaceId, conversationId, id: first.id },
    );
    await expect(citation()).toBeVisible();
    expect(
      (await messages()).find((item) => item.id === first.id)?.citations,
    ).toEqual(first.citations);
    await citation().click();
    await expect(drawer()).toContainText("知识 v1");
    await expect(drawer()).not.toContainText("修改后");
    await drawer().getByText("这条知识最初选自的文件", { exact: true }).click();
    await drawer()
      .getByRole("button", { name: "查看当时的文件文字", exact: true })
      .click();
    await expect(page.getByLabel("文件版本", { exact: true })).toHaveValue("1");
    await expect(page.getByRole("region", { name: "文件内容" })).toContainText(
      "发布定于周四。",
    );
    await expect(
      page.getByRole("region", { name: "文件内容" }),
    ).not.toContainText("周六");
    await page.keyboard.press("Escape");
    await expect(drawer()).toBeVisible();
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
