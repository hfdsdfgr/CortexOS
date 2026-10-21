import { expect, test, type Page } from "@playwright/test";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import type { GraphData, Point } from "../src/graph-data";

async function checkLabels(page: Page, selected: string | null) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector("canvas")!.getBoundingClientRect();
    const visible = [
      ...document.querySelectorAll<HTMLElement>(".graph-node-label"),
    ].filter((e) => getComputedStyle(e).visibility === "visible");
    const boxes = visible.map((e) => {
      const r = e.getBoundingClientRect();
      return {
        id: e.dataset.nodeId ?? null,
        edge: e.dataset.edgeId ?? null,
        selected: e.classList.contains("is-selected"),
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
      };
    });
    const panels = [
      ...document.querySelectorAll<HTMLElement>(
        ".graph-inspector,.graph-node-index,.graph-legend,.graph-view-status",
      ),
    ]
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      });
    const intersects = (
      a: (typeof panels)[number],
      b: (typeof panels)[number],
    ) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    return {
      boxes,
      count: document.querySelectorAll(".graph-label-layer .graph-node-label")
        .length,
      within: boxes.every(
        (b) =>
          b.x >= canvas.x - 1 &&
          b.y >= canvas.y - 1 &&
          b.x + b.w <= canvas.right + 1 &&
          b.y + b.h <= canvas.bottom + 1,
      ),
      overlaps: boxes.some((b, i) =>
        boxes.slice(i + 1).some((other) => intersects(b, other)),
      ),
      panelOverlap: boxes.some((b) => panels.some((p) => intersects(b, p))),
    };
  });
  expect(result.count).toBe(24);
  expect(result.within).toBe(true);
  expect(result.overlaps).toBe(false);
  expect(result.panelOverlap).toBe(false);
  expect(result.boxes.filter((b) => !b.edge).length).toBeLessThanOrEqual(7);
  expect(result.boxes.filter((b) => b.edge).length).toBeLessThanOrEqual(3);
  if (selected)
    expect(result.boxes.some((b) => b.id === selected && b.selected)).toBe(
      true,
    );
  return result;
}

test("native graph labels prioritize selection, avoid collisions and panels, and retain real relations", async ({}, info) => {
  test.setTimeout(120000);
  const app = await launchNative(info);
  try {
    const { page } = app;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1600, height: 900 });
    await createWorkspace(page, "图谱阅读检查");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const { nodeIds: ids } = await seedGraph(page, workspaceId, 80, 79, true);
    const longTitle =
      "末尾节点 长中文标题与 English graph label priority，正文仍通过详情完整阅读";
    await nativeInvoke(page, "save_knowledge", {
      input: {
        workspaceId,
        nodeId: ids[79],
        expectedRevision: 1,
        title: longTitle,
        kind: "knowledge",
        content: "密集标签检查内容。",
        changeReason: "长标题检查",
        sourceMessageId: null,
        sourceExcerpt: null,
      },
    });
    const points: Point[] = ids.map((_, i) =>
      i < 40
        ? [
            ((i % 5) - 2) * 0.08,
            ((Math.floor(i / 5) % 5) - 2) * 0.08,
            (i % 3) * 0.01,
          ]
        : [((i % 8) - 3.5) * 1.1, ((Math.floor(i / 8) % 5) - 2) * 1.1, -2],
    );
    points[0] = [0, 0, 0];
    points[79] = [0.02, 0.02, 0];
    points[60] = [-4, 1, 0];
    points[77] = [10000, 0, 0];
    points[78] = [0, 0, 30];
    await nativeInvoke(page, "save_graph_view", {
      input: {
        workspaceId,
        expectedRevision: 0,
        camera: [0, 0, 20],
        target: [0, 0, 0],
        positions: ids.map((nodeId, i) => ({ nodeId, position: points[i] })),
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
    const inspector = page.getByRole("complementary", {
      name: "图谱详情",
      exact: true,
    });
    const choose = async (index: number) => {
      if (!(await list.isVisible()))
        await page
          .getByRole("button", { name: "节点列表", exact: true })
          .click();
      const title =
        index === 0
          ? "中心知识"
          : index === 79
            ? longTitle
            : `关联条目 ${String(index).padStart(3, "0")}`;
      const button = list.getByRole("button", {
        name: new RegExp(`^${title}`),
      });
      if (!(await button.count()))
        await list
          .getByRole("button", { name: "再显示 50 个节点", exact: true })
          .click();
      await button.click();
      await expect(
        inspector.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(
          `.graph-node-label.is-selected[data-node-id="${ids[index]}"]`,
        ),
      ).toBeVisible();
      await page.waitForTimeout(180);
    };
    await choose(79);
    await checkLabels(page, ids[79]);
    expect(
      await page
        .locator(`.graph-node-label.is-selected[data-node-id="${ids[79]}"]`)
        .evaluate(
          (element) =>
            element.querySelector("em")!.getBoundingClientRect().right <=
            element.getBoundingClientRect().right + 1,
        ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("last-node-long-title.png"),
    });
    await choose(0);
    const dense = await checkLabels(page, ids[0]);
    expect(dense.boxes.length).toBeGreaterThan(1);
    expect(dense.boxes.some((b) => b.id === ids[77] || b.id === ids[78])).toBe(
      false,
    );
    await page.screenshot({ path: info.outputPath("dense-selected.png") });
    await choose(60);
    await page.getByText("图例与操作", { exact: true }).click();
    const toggle = page.getByLabel("显示选中节点的连线名称", { exact: true });
    await toggle.check();
    await expect(
      page.locator(".graph-node-label.is-relation").filter({ hasText: "支持" }),
    ).toBeVisible();
    for (const [width, height] of [
      [1366, 768],
      [1600, 900],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(180);
      await checkLabels(page, ids[60]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: info.outputPath(`reading-${width}.png`) });
    }
    await toggle.uncheck();
    await expect(
      page.locator(".graph-node-label.is-relation:visible"),
    ).toHaveCount(0);
    await page.getByText("图例与操作", { exact: true }).click();
    await page.waitForTimeout(400);
    const frames = Number(await canvas.getAttribute("data-render-count"));
    await page.waitForTimeout(350);
    expect(Number(await canvas.getAttribute("data-render-count"))).toBe(frames);
    await inspector.locator(".node-relations > summary").click();
    await expect(inspector.locator(".edge-details")).toHaveCount(1);
    await inspector.locator(".edge-details > summary").click();
    await expect(inspector.locator(".edge-history li")).toHaveCount(1);
    const after = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    expect(after).toEqual(before);
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
