import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";

test("seven-node preview supports 3D selection, demand rendering and WebGL fallback", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const started = Date.now();
  await page.goto("/#/graph");
  await expect(
    page.getByText("演示数据，不写入工作区", { exact: true }),
  ).toBeVisible();
  const canvas = page.locator('canvas[data-webgl-ready="true"]');
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => Number(await canvas.getAttribute("data-render-count")))
    .toBeGreaterThan(0);
  const loadMs = Date.now() - started;
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const camera = new PerspectiveCamera(
    45,
    box!.width / box!.height,
    0.1,
    500000,
  );
  camera.position.set(0, 9, 22);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const point = new Vector3(0, -1.7, 0).project(camera);
  await page.mouse.click(
    box!.x + ((point.x + 1) * box!.width) / 2,
    box!.y + ((-point.y + 1) * box!.height) / 2,
  );
  await expect(
    page.getByRole("heading", { name: "项目目标", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "移到选中节点", exact: true }).click();
  await page.getByRole("button", { name: "关闭图谱详情" }).click();
  await page.getByRole("button", { name: "适应当前视图" }).click();
  await expect.poll(async () => {
    const count = Number(await canvas.getAttribute("data-render-count"));
    await page.waitForTimeout(250);
    return Number(await canvas.getAttribute("data-render-count")) - count;
  }, { timeout: 5000 }).toBe(0);
  await page.screenshot({ path: testInfo.outputPath("graph-demo.png") });
  await writeFile(
    testInfo.outputPath("graph-observation.json"),
    JSON.stringify(
      { kind: "browser-demo", nodes: 7, loadMs, idleFramesOver250ms: 0 },
      null,
      2,
    ),
  );
  await testInfo.attach("small-graph-observation", {
    body: JSON.stringify({
      kind: "browser-demo",
      nodes: 7,
      loadMs,
      idleFramesOver250ms: 0,
    }),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "筛选", exact: true }).click();
  await page.getByLabel("节点类型筛选").selectOption("hypothesis");
  await expect(
    page.getByRole("status").filter({ hasText: "1 / 7 节点" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重置筛选", exact: true }).click();
  await canvas.evaluate((element) =>
    element.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
  );
  await expect(
    page.getByRole("heading", { name: "3D 暂不可用" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^能查到原始出处 知识，\s*已确认$/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "能查到原始出处", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "只看直接关联", exact: true }).click();
  await expect(page.locator(".graph-visible-count")).toHaveText(
    "已加载 3 / 7 节点",
  );
  await page
    .getByRole("button", { name: /^先做好知识查看和编辑 决定，/ })
    .click();
  await page.getByRole("button", { name: "展开直接关联", exact: true }).click();
  const ranges = page.getByLabel("关联节点范围", { exact: true });
  await expect(ranges.locator("[data-expansion-root]")).toHaveCount(2);
  await expect(page.locator(".graph-visible-count")).toHaveText(
    "已加载 5 / 7 节点",
  );
  await ranges
    .getByRole("button", { name: "收起 能查到原始出处 的展开", exact: true })
    .click();
  await expect(page.locator(".graph-visible-count")).toHaveText(
    "已加载 4 / 7 节点",
  );
  await ranges
    .getByRole("button", {
      name: "收起 先做好知识查看和编辑 的展开",
      exact: true,
    })
    .click();
  await expect(page.locator(".graph-visible-count")).toHaveText(
    "已加载 0 / 7 节点",
  );
  await expect(
    page.getByRole("heading", { name: "从知识建立关系", exact: true }),
  ).not.toBeVisible();
  await ranges
    .getByRole("button", { name: "返回全部节点", exact: true })
    .click();
  await expect(page.locator(".graph-visible-count")).toHaveText(
    "已加载 7 / 7 节点",
  );
  expect(errors).toEqual([]);
});
