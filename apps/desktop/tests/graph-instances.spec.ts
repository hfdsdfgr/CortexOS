import { expect, test } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import type { GraphData, Point } from "../src/graph-data";

test("instanced shapes preserve entity picking after filtering and moving, and V3 focus restores the exploration view", async ({}, info) => {
  const app = await launchNative(info);
  try {
    const { page } = app;
    // Entity-picking coordinates use a settled camera; animated motion has its own native check.
    await page.evaluate(() =>
      localStorage.setItem("cortexos.graph-motion", "instant"),
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1600, height: 900 });
    await createWorkspace(page, "批量绘制点击检查");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const kinds = [
      "knowledge",
      "knowledge",
      "context",
      "hypothesis",
      "decision",
      "evidence",
      "conflict",
      "context",
    ];
    const points: Point[] = kinds.map((_, i) => [
      -6 + (i % 4) * 4,
      i < 4 ? 2 : -2,
      0,
    ]);
    const ids: string[] = [];
    for (let i = 0; i < kinds.length; i++)
      ids.push(
        await nativeInvoke<string>(page, "save_knowledge", {
          input: {
            workspaceId,
            nodeId: null,
            expectedRevision: null,
            title: `节点 ${i}`,
            kind: kinds[i],
            content: `实体 ${i} 的文字`,
            changeReason: "隔离绘制检查",
            sourceMessageId: null,
            sourceExcerpt: null,
          },
        }),
      );
    for (const [from, to] of [
      [0, 1],
      [2, 3],
      [4, 5],
    ])
      await nativeInvoke(page, "save_knowledge_edge", {
        input: {
          workspaceId,
          edgeId: null,
          expectedVersion: null,
          fromNodeId: ids[from],
          toNodeId: ids[to],
          relation: "supports",
          active: true,
          changeReason: "检查箭头方向",
        },
      });
    await nativeInvoke(page, "save_graph_view", {
      input: {
        workspaceId,
        expectedRevision: 0,
        camera: [0, 0, 20],
        target: [0, 0, 0],
        positions: ids.map((nodeId, i) => ({ nodeId, position: points[i] })),
      },
    });
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    const canvas = page.locator('canvas[data-webgl-ready="true"]');
    await expect(canvas).toBeVisible();
    const inspector = page.getByRole("complementary", {
      name: "图谱详情",
      exact: true,
    });
    const click = async (point: Point) => {
      const bounds = (await canvas.boundingBox())!;
      const camera = new PerspectiveCamera(
        45,
        bounds.width / bounds.height,
        0.1,
        500000,
      );
      camera.position.set(0, 0, 20);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const projected = new Vector3(...point).project(camera);
      const x = bounds.x + ((projected.x + 1) * bounds.width) / 2;
      const y = bounds.y + ((-projected.y + 1) * bounds.height) / 2;
      await page.mouse.click(x, y);
    };
    const check = async (index: number) => {
      await expect(
        inspector.getByRole("heading", { name: `节点 ${index}`, exact: true }),
      ).toBeVisible();
      expect(new URL(page.url()).hash).toContain(`node=${ids[index]}`);
    };
    for (let i = 0; i < kinds.length; i++) {
      await click(points[i]);
      await check(i);
      await page
        .getByRole("button", { name: "关闭图谱详情", exact: true })
        .click();
    }
    await page.screenshot({ path: info.outputPath("all-shapes.png") });
    await page.getByRole("button", { name: "筛选", exact: true }).click();
    await page
      .getByLabel("节点类型筛选", { exact: true })
      .selectOption("knowledge");
    await click(points[1]);
    await check(1);
    await page
      .getByRole("button", { name: "关闭图谱详情", exact: true })
      .click();
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("节点 1");
    await click(points[1]);
    await check(1);
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("");
    await page.getByLabel("节点类型筛选", { exact: true }).selectOption("all");
    await page.getByText("节点位置", { exact: true }).click();
    await page.getByLabel("X", { exact: true }).fill("18");
    await page.getByRole("button", { name: "应用位置", exact: true }).click();
    await page
      .getByRole("button", { name: "关闭图谱详情", exact: true })
      .click();
    await click(points[1]);
    await expect(inspector).not.toBeVisible();
    await click([18, 2, 0]);
    await check(1);
    await page
      .getByRole("button", { name: "关闭图谱详情", exact: true })
      .click();
    await click(points[3]);
    await check(3);
    await page.getByRole("button", { name: "保存视图", exact: true }).click();
    await expect(page.getByText("视图已保存", { exact: true })).toBeVisible();
    const saved = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    for (let axis = 0; axis < 3; axis++)
      expect(saved.view.target[axis]).toBeCloseTo(points[3][axis], 5);
    await page.keyboard.press("Escape");
    await expect(inspector).not.toBeVisible();
    await page.getByRole("button", { name: "保存视图", exact: true }).click();
    await expect(page.getByText("视图已保存", { exact: true })).toBeVisible();
    const restored = await nativeInvoke<GraphData>(
      page,
      "load_knowledge_graph",
      {
        workspaceId,
      },
    );
    for (let axis = 0; axis < 3; axis++) {
      expect(restored.view.camera[axis]).toBeCloseTo([0, 0, 20][axis], 5);
      expect(restored.view.target[axis]).toBeCloseTo(0, 5);
    }
    expect(
      Number(await canvas.getAttribute("data-draw-calls")),
    ).toBeLessThanOrEqual(10);
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
