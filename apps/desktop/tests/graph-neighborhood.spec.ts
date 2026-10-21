import { expect, test } from "@playwright/test";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import type { GraphData } from "../src/graph-data";

test("native graph expands only active one-hop neighbors and keeps keyboard access and workspace scope", async ({}, info) => {
  test.setTimeout(120000);
  const app = await launchNative(info);
  try {
    const { page } = app;
    await createWorkspace(page, "关联范围 A");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const { nodeIds, edgeIds } = await seedGraph(
      page,
      workspaceId,
      58,
      55,
      true,
    );
    const edgeInput = {
      workspaceId,
      edgeId: null,
      expectedVersion: null,
      fromNodeId: nodeIds[0],
      toNodeId: nodeIds[56],
      relation: "supports",
      active: true,
      changeReason: "将停用的关系",
    };
    const inactive = await nativeInvoke<string>(page, "save_knowledge_edge", {
      input: edgeInput,
    });
    await nativeInvoke(page, "save_knowledge_edge", {
      input: {
        ...edgeInput,
        edgeId: inactive,
        expectedVersion: 1,
        active: false,
        changeReason: "停用",
      },
    });
    await nativeInvoke(page, "save_knowledge_edge", {
      input: {
        ...edgeInput,
        fromNodeId: nodeIds[1],
        toNodeId: nodeIds[57],
        changeReason: "两跳关系",
      },
    });
    const before = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    const canvas = page.locator('canvas[data-webgl-ready="true"]');
    await expect(canvas).toBeVisible();
    const list = page.getByRole("complementary", {
      name: "图谱节点列表",
      exact: true,
    });
    const toggle = page.getByRole("button", { name: "节点列表", exact: true });
    await expect(list).not.toBeVisible();
    await toggle.click();
    await expect(list.locator(".graph-node-row")).toHaveCount(50);
    await list
      .getByRole("button", { name: "再显示 50 个节点", exact: true })
      .click();
    await expect(list.locator(".graph-node-row")).toHaveCount(58);
    await expect(list.locator(".graph-node-row").nth(50)).toBeFocused();
    await list.getByRole("button", { name: /^中心知识/ }).click();
    const inspector = page.getByRole("complementary", {
      name: "图谱详情",
      exact: true,
    });
    await expect(inspector).toBeFocused();
    await page
      .getByRole("button", { name: "只看直接关联", exact: true })
      .click();
    const range = page.getByLabel("关联节点范围", { exact: true });
    await expect(range).toContainText("已加载 50 / 56 个匹配节点");
    await range
      .getByRole("button", { name: "再展开 50 个", exact: true })
      .click();
    await expect(range).toContainText("已加载 56 / 56 个匹配节点");
    await expect(
      range.getByRole("button", { name: "返回全部节点", exact: true }),
    ).toBeFocused();
    await toggle.click();
    await list
      .getByRole("button", { name: "再显示 50 个节点", exact: true })
      .click();
    await expect(list.locator(".graph-node-row")).toHaveCount(56);
    await expect(
      list.getByRole("button", { name: /关联条目 056|关联条目 057/ }),
    ).toHaveCount(0);
    await list.getByRole("button", { name: /^中心知识/ }).focus();
    await page.keyboard.press("Escape");
    await expect(list).not.toBeVisible();
    await expect(toggle).toBeFocused();
    await inspector.locator(".node-relations > summary").click();
    await expect(inspector.locator(".edge-details")).toHaveCount(50);
    await inspector
      .getByRole("button", { name: "再显示 50 条关系", exact: true })
      .click();
    await expect(inspector.locator(".edge-details")).toHaveCount(56);
    await expect(
      inspector.locator(".edge-details").nth(50).locator("summary"),
    ).toBeFocused();
    const edge = inspector.locator(`[data-edge-id="${edgeIds[0]}"]`);
    await edge.locator("summary").click();
    await expect(edge).toContainText("尚未登记证明这条关系的资料");
    await edge.getByRole("button", { name: "查看终点", exact: true }).click();
    await expect(
      inspector.getByRole("heading", { name: "关联条目 001", exact: true }),
    ).toBeVisible();
    await expect(inspector).toBeFocused();
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    await page
      .getByLabel("节点类型筛选", { exact: true })
      .selectOption("context");
    await expect(
      inspector.getByRole("button", { name: "显示这个节点", exact: true }),
    ).toBeVisible();
    await inspector
      .getByRole("button", { name: "显示这个节点", exact: true })
      .click();
    await expect(page.getByLabel("节点类型筛选", { exact: true })).toHaveValue(
      "context",
    );
    await expect(inspector).toContainText("已临时显示这个节点");
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("没有此标题");
    await expect(
      inspector.getByRole("button", { name: "显示这个节点", exact: true }),
    ).toBeVisible();
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("");
    await page.getByLabel("节点类型筛选", { exact: true }).selectOption("all");
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
      await page.screenshot({ path: info.outputPath(`related-${width}.png`) });
    }
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("关联");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "设置", exact: true })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    await expect(page.getByLabel("搜索图谱节点", { exact: true })).toHaveValue(
      "关联",
    );
    await expect(range).toContainText("已加载 55 / 55 个匹配节点");
    await createWorkspace(page, "关联范围 B");
    await expect(page.getByLabel("搜索图谱节点", { exact: true })).toHaveValue(
      "",
    );
    await expect(range).not.toBeVisible();
    await page
      .getByLabel("当前工作区", { exact: true })
      .selectOption(workspaceId);
    await expect(page.getByLabel("搜索图谱节点", { exact: true })).toHaveValue(
      "关联",
    );
    await expect(range).toContainText("已加载 55 / 55 个匹配节点");
    await canvas.evaluate((element) =>
      element.dispatchEvent(
        new Event("webglcontextlost", { cancelable: true }),
      ),
    );
    await expect(
      page.getByRole("heading", { name: "3D 暂不可用", exact: true }),
    ).toBeVisible();
    await expect(list).toBeVisible();
    await list.getByRole("button", { name: /^关联条目 001/ }).click();
    await expect(
      inspector.getByRole("button", { name: "只看直接关联", exact: true }),
    ).toBeEnabled();
    await page.setViewportSize({ width: 375, height: 812 });
    await inspector
      .getByRole("button", { name: "只看直接关联", exact: true })
      .click();
    await toggle.click();
    await list.getByRole("button", { name: /^关联条目 001/ }).focus();
    await page.keyboard.press("Escape");
    await expect(toggle).toBeFocused();
    await inspector
      .getByRole("button", { name: "只看直接关联", exact: true })
      .click();
    await page.screenshot({ path: info.outputPath("fallback-375.png") });
    const after = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    expect(after).toEqual(before);
    await range
      .getByRole("button", { name: "返回全部节点", exact: true })
      .click();
    await expect(range).not.toBeVisible();
    await expect(toggle).toBeFocused();
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
