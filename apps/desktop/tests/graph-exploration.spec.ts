import { expect, test } from "@playwright/test";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import type { GraphData } from "../src/graph-data";
import type { GraphNodePage } from "../src/graph-query";

test("multiple graph centers preserve shared nodes, exact totals, selection, drafts and workspace isolation", async ({}, info) => {
  test.setTimeout(120000);
  const app = await launchNative(info);
  try {
    const { page } = app;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1600, height: 900 });
    await createWorkspace(page, "多中心 A");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const { nodeIds: ids } = await seedGraph(page, workspaceId, 70, 0);
    const edge = async (from: number, to: number) =>
      nativeInvoke<string>(page, "save_knowledge_edge", {
        input: {
          workspaceId,
          edgeId: null,
          expectedVersion: null,
          fromNodeId: ids[from],
          toNodeId: ids[to],
          relation: "supports",
          active: true,
          changeReason: "多中心隔离检查",
        },
      });
    await edge(0, 1);
    for (let i = 2; i <= 10; i++) {
      await edge(0, i);
      await edge(1, i);
    }
    for (let i = 11; i <= 58; i++) await edge(0, i);
    for (let i = 59; i <= 64; i++) await edge(1, i);
    await edge(2, 0); // A -> B -> shared -> A; no recursive expansion.
    await edge(11, 66); // Two hops from A, outside both explicit ranges.
    const inactive = await edge(0, 65);
    await nativeInvoke(page, "save_knowledge_edge", {
      input: {
        workspaceId,
        edgeId: inactive,
        expectedVersion: 1,
        fromNodeId: ids[0],
        toNodeId: ids[65],
        relation: "supports",
        active: false,
        changeReason: "停用关系不展开",
      },
    });
    const before = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    const base = {
      workspaceId,
      query: "",
      kind: "all",
      status: "all",
      sinceUtc: null,
      rootNodeId: null,
      rootNodeIds: [ids[0], ids[1]],
      offset: 0,
      limit: 200,
      expectedSnapshot: null,
    };
    const read = (input: object) =>
      nativeInvoke<GraphNodePage>(page, "query_graph_nodes", { input });
    const union = await read(base);
    expect(union.matchingNodes).toBe(65);
    expect(union.rangeNodes).toBe(65);
    expect(new Set(union.nodes.map((n) => n.id)).size).toBe(65);
    expect(union.nodes.some((n) => n.id === ids[65] || n.id === ids[66])).toBe(
      false,
    );
    expect((await read({ ...base, rootNodeIds: [] })).nodes).toHaveLength(0);
    await expect(
      read({ ...base, rootNodeIds: [ids[0], ids[0]] }),
    ).rejects.toThrow(/不能重复/);
    await expect(read({ ...base, rootNodeId: ids[0] })).rejects.toThrow(
      /不要同时/,
    );
    await expect(
      read({ ...base, rootNodeIds: ids.slice(0, 21) }),
    ).rejects.toThrow(/最多20/);
    await createWorkspace(page, "多中心 B");
    const other = await page.getByLabel("当前工作区").inputValue();
    await expect(read({ ...base, workspaceId: other })).rejects.toThrow(
      /不属于当前工作区/,
    );
    await page.getByLabel("当前工作区").selectOption(workspaceId);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    const count = page.locator(".graph-visible-count");
    const range = page.getByLabel("关联节点范围", { exact: true });
    const list = page.getByRole("complementary", {
      name: "图谱节点列表",
      exact: true,
    });
    const inspector = page.getByRole("complementary", {
      name: "图谱详情",
      exact: true,
    });
    const toggle = page.getByRole("button", { name: "节点列表", exact: true });
    const source = (id: string) =>
      range.locator(`[data-expansion-root="${id}"]`);
    const choose = async (index: number) => {
      if (!(await list.isVisible())) await toggle.click();
      const title =
        index === 0 ? "中心知识" : `关联条目 ${String(index).padStart(3, "0")}`;
      await list.getByRole("button", { name: new RegExp(`^${title}`) }).click();
      await expect(
        inspector.getByRole("heading", { name: title, exact: true }),
      ).toBeVisible();
    };
    const expandBoth = async () => {
      await choose(0);
      await inspector
        .getByRole("button", { name: "只看直接关联", exact: true })
        .click();
      await expect(count).toHaveText("已加载 50 / 70 节点");
      await choose(1);
      await inspector
        .getByRole("button", { name: "展开直接关联", exact: true })
        .click();
      await expect(range.locator("li[data-expansion-root]")).toHaveCount(2);
      await expect(count).toHaveText("已加载 56 / 70 节点");
    };
    await expect(count).toHaveText("已加载 70 / 70 节点");
    await expect(page.locator('canvas[data-webgl-ready="true"]')).toBeVisible();
    await expandBoth();
    await expect(source(ids[0])).toContainText("已加载 50 / 59 个匹配节点");
    await expect(source(ids[1])).toContainText("已加载 17 / 17 个匹配节点");
    await source(ids[0])
      .getByRole("button", { name: "再展开 50 个", exact: true })
      .click();
    await expect(count).toHaveText("已加载 65 / 70 节点");
    await expect(
      range.getByRole("button", { name: "返回全部节点", exact: true }),
    ).toBeFocused();
    await choose(2);
    await inspector.getByText("显示范围", { exact: true }).click();
    await expect(inspector.locator(".node-display-sources li")).toHaveText([
      "中心知识",
      "关联条目 001",
    ]);
    await inspector.getByText("节点位置", { exact: true }).click();
    await inspector.getByLabel("X", { exact: true }).fill("12");
    await inspector
      .getByRole("button", { name: "应用位置", exact: true })
      .click();
    await inspector.evaluate((e) => e.scrollTo(0, 0));
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
      await page.screenshot({
        path: info.outputPath(`multiple-centers-${width}.png`),
      });
    }
    await choose(11);
    await source(ids[0])
      .getByRole("button", { name: "收起 中心知识 的展开", exact: true })
      .click();
    await expect(count).toHaveText("已加载 17 / 70 节点");
    await expect(
      inspector.getByRole("heading", { name: "关联条目 011", exact: true }),
    ).toBeVisible();
    await expect(
      inspector.getByRole("button", { name: "显示这个节点", exact: true }),
    ).toBeVisible();
    await expect(
      source(ids[1]).getByRole("button", {
        name: "收起 关联条目 001 的展开",
        exact: true,
      }),
    ).toBeFocused();
    await choose(2);
    await inspector.getByText("显示范围", { exact: true }).click();
    await expect(inspector.locator(".node-display-sources li")).toHaveText([
      "关联条目 001",
    ]);
    await inspector.getByText("节点位置", { exact: true }).click();
    await expect(inspector.getByLabel("X", { exact: true })).toHaveValue("12");
    await source(ids[1])
      .getByRole("button", { name: "收起 关联条目 001 的展开", exact: true })
      .click();
    await expect(count).toHaveText("已加载 0 / 70 节点");
    await expect(
      range.getByRole("button", { name: "返回全部节点", exact: true }),
    ).toBeFocused();
    await expect(
      inspector.getByRole("heading", { name: "关联条目 002", exact: true }),
    ).toBeVisible();
    await inspector
      .getByRole("button", { name: "展开直接关联", exact: true })
      .click();
    await expect(count).toHaveText("已加载 3 / 70 节点");
    await range
      .getByRole("button", { name: "返回全部节点", exact: true })
      .click();
    await expect(count).toHaveText("已加载 70 / 70 节点");
    await expandBoth();
    await page.getByRole("button", { name: "保存视图", exact: true }).click();
    await expect(page.getByText("视图已保存", { exact: true })).toBeVisible();
    const saved = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    expect(saved.nodes).toEqual(before.nodes);
    expect(saved.edges).toEqual(before.edges);
    expect(
      saved.view.positions.find((p) => p.nodeId === ids[2])?.position[0],
    ).toBe(12);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "设置", exact: true })
      .click();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    await expect(range.locator("li[data-expansion-root]")).toHaveCount(2);
    await expect(count).toHaveText("已加载 56 / 70 节点");
    await page.getByLabel("当前工作区").selectOption(other);
    await expect(range).not.toBeVisible();
    await page.getByLabel("当前工作区").selectOption(workspaceId);
    await expect(range.locator("li[data-expansion-root]")).toHaveCount(2);
    await expect(count).toHaveText("已加载 56 / 70 节点");
    // Hold a real union response, collapse A, then let the older two-center read finish.
    await page.evaluate(() => {
      const w = window as unknown as {
        expansionReadCheck?: {
          delayed: boolean;
          released: boolean;
          finished: boolean;
          release: () => void;
          restore: () => void;
        };
      };
      const original = window.fetch;
      w.expansionReadCheck = {
        delayed: false,
        released: false,
        finished: false,
        release: () => {},
        restore: () => {
          window.fetch = original;
        },
      };
      window.fetch = async (input, options) => {
        const response = await original(input, options);
        const body = options?.body;
        const json =
          typeof body === "string"
            ? body
            : body instanceof Uint8Array
              ? new TextDecoder().decode(body)
              : "{}";
        const payload = JSON.parse(json);
        const check = w.expansionReadCheck!;
        if (
          String(input).includes("/query_graph_nodes") &&
          payload.input?.rootNodeIds?.length === 2 &&
          payload.input?.query === "关联"
        ) {
          check.delayed = true;
          return new Promise((resolve) => {
            check.release = () => {
              check.released = true;
              resolve(response);
            };
          });
        }
        if (check.released && String(input).includes("/load_graph_links"))
          check.finished = true;
        return response;
      };
    });
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("关联");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { expansionReadCheck: { delayed: boolean } })
              .expansionReadCheck.delayed,
        ),
      )
      .toBe(true);
    await source(ids[0])
      .getByRole("button", { name: "收起 中心知识 的展开", exact: true })
      .click();
    await expect(count).toHaveText("已加载 16 / 70 节点");
    await page.evaluate(() =>
      (
        window as unknown as { expansionReadCheck: { release: () => void } }
      ).expansionReadCheck.release(),
    );
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { expansionReadCheck: { finished: boolean } })
              .expansionReadCheck.finished,
        ),
      )
      .toBe(true);
    await page.evaluate(() =>
      (
        window as unknown as { expansionReadCheck: { restore: () => void } }
      ).expansionReadCheck.restore(),
    );
    await expect(count).toHaveText("已加载 16 / 70 节点");
    await expect(range.locator("li[data-expansion-root]")).toHaveCount(1);
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("");
    await expect(count).toHaveText("已加载 17 / 70 节点");
    await page
      .locator('canvas[data-webgl-ready="true"]')
      .evaluate((e) =>
        e.dispatchEvent(new Event("webglcontextlost", { cancelable: true })),
      );
    await expect(
      page.getByRole("heading", { name: "3D 暂不可用", exact: true }),
    ).toBeVisible();
    await choose(2);
    await inspector
      .getByRole("button", { name: "展开直接关联", exact: true })
      .click();
    await expect(count).toHaveText("已加载 17 / 70 节点");
    await expect(range.locator("li[data-expansion-root]")).toHaveCount(2);
    await page.getByLabel("数据", { exact: true }).selectOption("demo");
    await expect(range).not.toBeVisible();
    await expect(count).toHaveText("已加载 7 / 7 节点");
    await page.getByLabel("数据", { exact: true }).selectOption("workspace");
    await expect(range.locator("li[data-expansion-root]")).toHaveCount(2);
    await expect(count).toHaveText("已加载 17 / 70 节点");
    // Explicitly displayed nodes survive removal of every expansion source.
    await choose(0);
    await inspector
      .getByRole("button", { name: "展开直接关联", exact: true })
      .click();
    await expect(count).toHaveText("已加载 56 / 70 节点");
    await choose(11);
    await source(ids[0])
      .getByRole("button", { name: "收起 中心知识 的展开", exact: true })
      .click();
    await expect(count).toHaveText("已加载 17 / 70 节点");
    await inspector
      .getByRole("button", { name: "显示这个节点", exact: true })
      .click();
    await expect(count).toHaveText("已加载 18 / 70 节点");
    await source(ids[1])
      .getByRole("button", { name: "收起 关联条目 001 的展开", exact: true })
      .click();
    await expect(count).toHaveText("已加载 4 / 70 节点");
    await source(ids[2])
      .getByRole("button", { name: "收起 关联条目 002 的展开", exact: true })
      .click();
    await expect(count).toHaveText("已加载 1 / 70 节点");
    await expect(
      inspector.getByRole("heading", { name: "关联条目 011", exact: true }),
    ).toBeVisible();
    await range
      .getByRole("button", { name: "返回全部节点", exact: true })
      .click();
    await expect(count).toHaveText("已加载 70 / 70 节点");
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
