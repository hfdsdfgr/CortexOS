import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import type { Bootstrap } from "../src/studio";
import type { GraphData } from "../src/graph-data";
import type { KnowledgeDetail } from "../src/Knowledge";

test.use({ actionTimeout: 10000 });
test("native graph persists relationships, independent views and knowledge edits", async ({}, testInfo) => {
  test.setTimeout(120000);
  let app = await launchNative(testInfo);
  try {
    let { page } = app;
    await createWorkspace(page, "图谱验收 A");
    const workspace = (await nativeInvoke<Bootstrap>(page, "bootstrap"))
      .workspaces[0].id;
    const titles = [
      "项目目标",
      "用户访谈",
      "来源可追溯",
      "二维闭环",
      "关联假设",
      "视觉取舍",
      "按需详情",
    ];
    const kinds = [
      "context",
      "evidence",
      "knowledge",
      "decision",
      "hypothesis",
      "conflict",
      "knowledge",
    ];
    const ids: string[] = [];
    for (let index = 0; index < 7; index++)
      ids.push(
        await nativeInvoke<string>(page, "save_knowledge", {
          input: {
            workspaceId: workspace,
            nodeId: null,
            expectedRevision: null,
            title: titles[index],
            kind: kinds[index],
            content: `${titles[index]}的合成验收内容。`,
            changeReason: "图谱验收",
            sourceMessageId: null,
            sourceExcerpt: null,
          },
        }),
      );
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    const started = Date.now();
    const canvas = page.locator('canvas[data-webgl-ready="true"]');
    await expect(canvas).toBeVisible();
    await expect
      .poll(async () => Number(await canvas.getAttribute("data-render-count")))
      .toBeGreaterThan(0);
    const loadMs = Date.now() - started;
    await page
      .getByRole("button", { name: "项目目标 背景 · 草案", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "项目目标", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "添加关系", exact: true }).click();
    let editor = page.getByRole("dialog", { name: "添加关系", exact: true });
    await editor.getByLabel("终点", { exact: true }).selectOption(ids[2]);
    await editor
      .getByLabel("修改说明", { exact: true })
      .fill("目标支持来源追溯");
    await nativeInvoke(page, "plugin:window|close", { label: "main" });
    const leaving = page.getByRole("dialog", {
      name: "保留未保存的关系修改？",
    });
    await expect(leaving).toBeVisible();
    await leaving.getByRole("button", { name: "继续编辑" }).click();
    await editor.getByRole("button", { name: "保存关系", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await page.getByRole("button", { name: "聚焦节点", exact: true }).click();
    await page.getByText("节点位置", { exact: true }).click();
    await page.getByLabel("X", { exact: true }).fill("4");
    await page.getByRole("button", { name: "应用位置", exact: true }).click();
    await page.getByRole("button", { name: "保存视图", exact: true }).click();
    await expect(page.getByText("视图已保存", { exact: true })).toBeVisible();
    let graph = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId: workspace,
    });
    expect(graph.edges.length).toBe(1);
    expect(graph.view.revision).toBe(1);
    expect(
      graph.view.positions.find((p) => p.nodeId === ids[0])?.position[0],
    ).toBe(4);
    const savedView = graph.view;
    let knowledge = await nativeInvoke<KnowledgeDetail>(page, "get_knowledge", {
      workspaceId: workspace,
      nodeId: ids[0],
    });
    expect(knowledge.versions.length).toBe(1);
    const edge = graph.edges[0];
    await page.locator(".edge-details summary").click();
    await page.getByRole("button", { name: "修改关系", exact: true }).click();
    editor = page.getByRole("dialog", { name: "修改关系", exact: true });
    await editor
      .getByLabel("关系类型", { exact: true })
      .selectOption("depends_on");
    await editor.getByLabel("修改说明", { exact: true }).fill("改为依赖");
    await nativeInvoke(page, "save_knowledge_edge", {
      input: {
        workspaceId: workspace,
        edgeId: edge.id,
        expectedVersion: 1,
        fromNodeId: ids[0],
        toNodeId: ids[2],
        relation: "derived_from",
        active: true,
        changeReason: "并发关系修订",
      },
    });
    await editor.getByRole("button", { name: "保存关系", exact: true }).click();
    await expect(editor.getByRole("alert")).toContainText("另一处修改");
    await expect(editor.getByLabel("修改说明", { exact: true })).toHaveValue(
      "改为依赖",
    );
    await editor.getByRole("button", { name: "读取最新关系" }).click();
    await expect(
      editor.getByText("并发关系修订", { exact: true }),
    ).toBeVisible();
    await editor
      .getByRole("button", { name: "已比较，保留我的关系编辑" })
      .click();
    await editor.getByRole("button", { name: "保存关系", exact: true }).click();
    await expect(editor).not.toBeVisible();
    await page.getByRole("button", { name: "修改草案", exact: true }).click();
    const knowledgeEditor = page.getByRole("dialog", {
      name: "修改知识草案",
      exact: true,
    });
    await knowledgeEditor
      .getByLabel("正文", { exact: true })
      .fill("从图谱修订的项目目标。");
    await knowledgeEditor
      .getByLabel("修改说明", { exact: true })
      .fill("图谱编辑复用");
    await knowledgeEditor
      .getByRole("button", { name: "保存草案", exact: true })
      .click();
    await expect(knowledgeEditor).not.toBeVisible();
    await expect(
      page.getByRole("heading", { name: "图谱", level: 1, exact: true }),
    ).toBeVisible();
    await expect(
      page.locator(".graph-inspector .knowledge-prose").first(),
    ).toHaveText("从图谱修订的项目目标。");
    await page.getByRole("button", { name: "审核并确认", exact: true }).click();
    await page.getByRole("button", { name: "确认此版本", exact: true }).click();
    await expect(
      page.locator(".graph-inspector .knowledge-state"),
    ).toContainText("生效版本 v2");
    await page
      .getByRole("button", { name: "适应全部节点", exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath("native-knowledge-graph.png"),
    });
    await page.getByRole("button", { name: "关闭图谱详情" }).click();
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + 30, box!.y + 70);
    await page.mouse.down();
    await page.mouse.move(box!.x + 110, box!.y + 110, { steps: 8 });
    await page.mouse.up();
    await page.getByRole("button", { name: "保存视图", exact: true }).click();
    await expect(page.getByText("视图已保存", { exact: true })).toBeVisible();
    graph = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId: workspace,
    });
    expect(graph.view.camera).not.toEqual(savedView.camera);
    const finalView = graph.view;
    await page
      .getByRole("button", { name: "项目目标 背景 · 已确认", exact: true })
      .click();
    await page.locator(".edge-details summary").click();
    await page.getByRole("button", { name: "修改关系", exact: true }).click();
    editor = page.getByRole("dialog", { name: "修改关系", exact: true });
    await editor.getByRole("checkbox").uncheck();
    await editor
      .getByLabel("修改说明", { exact: true })
      .fill("暂时停用，保留历史");
    await editor.getByRole("button", { name: "保存关系", exact: true }).click();
    await expect(editor).not.toBeVisible();
    graph = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId: workspace,
    });
    expect(graph.edges[0].id).toBe(edge.id);
    expect(graph.edges[0].versions.length).toBe(4);
    expect(graph.edges[0].versions[0].active).toBe(false);
    await page.getByRole("button", { name: "关闭图谱详情" }).click();
    await createWorkspace(page, "图谱验收 B");
    await expect(
      page.getByRole("heading", { name: "从知识建立关系" }),
    ).toBeVisible();
    await page.getByLabel("当前工作区").selectOption(workspace);
    await expect(canvas).toBeVisible();
    await page.getByLabel("节点审核筛选").selectOption("confirmed");
    await expect(page.getByText("1 / 7 节点", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "清除筛选" }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole("button", { name: "节点列表", exact: true }).click();
    await page
      .getByRole("button", { name: "项目目标 背景 · 已确认", exact: true })
      .click();
    await expect(page.locator(".graph-inspector")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("native-graph-narrow.png"),
    });
    await page.getByRole("button", { name: "关闭图谱详情" }).click();
    await canvas.evaluate((element) =>
      element.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      ),
    );
    await expect(
      page.getByRole("heading", { name: "3D 暂不可用" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "项目目标 背景 · 已确认", exact: true })
      .click();
    await expect(
      page.locator(".graph-inspector .knowledge-prose").first(),
    ).toHaveText("从图谱修订的项目目标。");
    expect(app.consoleErrors).toEqual([]);
    await app.closeWindow();
    await app.stop();
    app = await launchNative(testInfo);
    page = app.page;
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    await expect(page.locator('canvas[data-webgl-ready="true"]')).toBeVisible();
    graph = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId: workspace,
    });
    expect(graph.view).toEqual(finalView);
    expect(graph.edges[0].versions.length).toBe(4);
    knowledge = await nativeInvoke<KnowledgeDetail>(page, "get_knowledge", {
      workspaceId: workspace,
      nodeId: ids[0],
    });
    expect(knowledge.versions.length).toBe(2);
    expect(knowledge.node.effectiveVersion).toBe(2);
    const reopenedCanvas = page.locator('canvas[data-webgl-ready="true"]');
    const reopenedBox = await reopenedCanvas.boundingBox();
    await page.mouse.click(reopenedBox!.x + 25, reopenedBox!.y + 75);
    await page.getByRole("button", { name: "保存视图", exact: true }).click();
    await expect(page.getByText("视图已保存", { exact: true })).toBeVisible();
    const recaptured = await nativeInvoke<GraphData>(
      page,
      "load_knowledge_graph",
      { workspaceId: workspace },
    );
    for (let axis = 0; axis < 3; axis++) {
      expect(recaptured.view.camera[axis]).toBeCloseTo(
        finalView.camera[axis],
        5,
      );
      expect(recaptured.view.target[axis]).toBeCloseTo(
        finalView.target[axis],
        5,
      );
    }

    const renderer = await page.locator("canvas").evaluate((element) => {
      const gl = element.getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? String(gl?.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unavailable";
    });
    await writeFile(testInfo.outputPath("graph-observation.json"),JSON.stringify({kind:"native-production",nodes:7,loadMs,viewRevision:recaptured.view.revision,relationshipVersions:4,knowledgeVersions:2,restartPreserved:true,cameraRecaptureVerified:true,renderer},null,2));
    await testInfo.attach("native-small-graph-observation", {
      body: JSON.stringify({
        nodes: 7,
        loadMs,
        viewRevision: graph.view.revision,
        relationshipVersions: 4,
        knowledgeVersions: 2,
        restartPreserved: true,
      }),
      contentType: "application/json",
    });
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
