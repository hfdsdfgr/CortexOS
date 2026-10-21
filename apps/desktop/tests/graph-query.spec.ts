import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import {
  defaultPositions,
  type GraphData,
  type GraphEdge,
} from "../src/graph-data";
import type {
  GraphNodePage,
  HistoryPage,
  RelationPage,
} from "../src/graph-query";

test("paged graph preserves scope, Unicode search, lazy history, cross-page editing and saved positions", async ({}, info) => {
  test.setTimeout(180000);
  const app = await launchNative(info);
  try {
    const { page } = app;
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await createWorkspace(page, "按需读取 A");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    const { nodeIds, edgeIds } = await seedGraph(page, workspaceId, 260, 260);
    const unicodeId = await nativeInvoke<string>(page, "save_knowledge", {
      input: {
        workspaceId,
        nodeId: null,
        expectedRevision: null,
        title: "CAFÉ Ω",
        kind: "knowledge",
        content: "跨页节点",
        changeReason: "隔离数据",
        sourceMessageId: null,
        sourceExcerpt: null,
      },
    });
    for (let version = 2; version <= 101; version++)
      await nativeInvoke(page, "save_knowledge_edge", {
        input: {
          workspaceId,
          edgeId: edgeIds[0],
          expectedVersion: version - 1,
          fromNodeId: nodeIds[0],
          toNodeId: nodeIds[1],
          relation: version % 2 === 0 ? "depends_on" : "supports",
          active: version !== 101,
          changeReason: `关系修订 ${version}`,
        },
      });
    const base = {
      workspaceId,
      query: "",
      kind: "all",
      status: "all",
      sinceUtc: null,
      rootNodeId: null as string | null,
      offset: 0,
      limit: 200,
      expectedSnapshot: null as string | null,
    };
    const read = (input: typeof base) =>
      nativeInvoke<GraphNodePage>(page, "query_graph_nodes", { input });
    const start = performance.now();
    const full = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    const fullMs = performance.now() - start;
    const pagedStart = performance.now();
    const first = await read(base);
    const links = await nativeInvoke<GraphEdge[]>(page, "load_graph_links", {
      workspaceId,
      nodeIds: first.nodes.map((n) => n.id),
      expectedSnapshot: first.snapshot,
    });
    const pageMs = performance.now() - pagedStart;
    expect(first.nodes).toHaveLength(200);
    expect(first.totalNodes).toBe(261);
    expect(first.matchingNodes).toBe(261);
    expect(first.nodes.map((n) => n.id)).toEqual(
      full.nodes.slice(0, 200).map((n) => n.id),
    );
    expect(
      links.every((e) => e.versions.length === 1 && e.versions[0].active),
    ).toBe(true);
    const second = await read({
      ...base,
      offset: 200,
      expectedSnapshot: first.snapshot,
    });
    expect(second.nodes).toHaveLength(61);
    expect(
      new Set([...first.nodes, ...second.nodes].map((n) => n.id)).size,
    ).toBe(261);
    const unicode = await read({ ...base, query: "café ω" });
    expect(unicode.nodes.map((n) => n.id)).toEqual([unicodeId]);
    expect(defaultPositions(unicode.nodes)[unicodeId]).toEqual(
      defaultPositions(full.nodes)[unicodeId],
    );
    const related = await nativeInvoke<RelationPage>(
      page,
      "query_graph_relations",
      {
        workspaceId,
        nodeId: nodeIds[0],
        offset: 0,
        limit: 50,
        expectedSnapshot: null,
      },
    );
    expect(
      related.edges.find((e) => e.id === edgeIds[0])?.versions,
    ).toHaveLength(1);
    let beforeVersion: number | null = null;
    const versions: number[] = [];
    do {
      const history: HistoryPage = await nativeInvoke(
        page,
        "load_graph_edge_history",
        { workspaceId, edgeId: edgeIds[0], beforeVersion, limit: 50 },
      );
      expect(history.versions.length).toBeLessThanOrEqual(50);
      expect(history.total).toBe(101);
      versions.push(...history.versions.map((v) => v.version));
      beforeVersion = history.nextBefore;
    } while (beforeVersion);
    expect(versions).toEqual(Array.from({ length: 101 }, (_, i) => 101 - i));
    await expect(read({ ...base, limit: 201 })).rejects.toThrow(/参数无效/);
    await createWorkspace(page, "按需读取 B");
    const other = await page.getByLabel("当前工作区").inputValue();
    for (const [command, args] of [
      ["load_graph_node", { workspaceId: other, nodeId: nodeIds[0] }],
      [
        "query_graph_relations",
        {
          workspaceId: other,
          nodeId: nodeIds[0],
          offset: 0,
          limit: 50,
          expectedSnapshot: null,
        },
      ],
      [
        "load_graph_edge_history",
        {
          workspaceId: other,
          edgeId: edgeIds[0],
          beforeVersion: null,
          limit: 50,
        },
      ],
    ] as const)
      await expect(nativeInvoke(page, command, args)).rejects.toThrow(
        /不属于当前工作区/,
      );
    await expect(
      read({ ...base, workspaceId: other, rootNodeId: nodeIds[0] }),
    ).rejects.toThrow(/不属于当前工作区/);
    const otherPage = await read({ ...base, workspaceId: other });
    await expect(
      nativeInvoke(page, "load_graph_links", {
        workspaceId: other,
        nodeIds: [nodeIds[0]],
        expectedSnapshot: otherPage.snapshot,
      }),
    ).rejects.toThrow(/不属于当前工作区/);
    await nativeInvoke(page, "save_knowledge", {
      input: {
        workspaceId,
        nodeId: unicodeId,
        expectedRevision: 1,
        title: "CAFÉ Ω",
        kind: "knowledge",
        content: "修订后的跨页节点",
        changeReason: "快照变化",
        sourceMessageId: null,
        sourceExcerpt: null,
      },
    });
    await expect(
      read({ ...base, offset: 200, expectedSnapshot: first.snapshot }),
    ).rejects.toThrow(/图谱已更新/);
    const unseen = second.nodes.find((n) => n.id !== unicodeId)!.id;
    await nativeInvoke(page, "save_graph_view", {
      input: {
        workspaceId,
        expectedRevision: 0,
        camera: [0, 0, 20],
        target: [0, 0, 0],
        positions: [
          { nodeId: nodeIds[0], position: [0, 0, 0] },
          { nodeId: unicodeId, position: [15, 0, 0] },
          { nodeId: unseen, position: [3, 4, 5] },
        ],
      },
    });
    await page.getByLabel("当前工作区").selectOption(workspaceId);
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "图谱", exact: true })
      .click();
    const count = page.locator(".graph-visible-count");
    await expect(count).toHaveText("已加载 200 / 261 节点");
    await expect(page.locator('canvas[data-webgl-ready="true"]')).toBeVisible();
    const list = page.getByRole("complementary", {
      name: "图谱节点列表",
      exact: true,
    });
    const toggle = page.getByRole("button", { name: "节点列表", exact: true });
    await toggle.click();
    await list.getByRole("button", { name: /^中心知识/ }).click();
    const inspector = page.getByRole("complementary", {
      name: "图谱详情",
      exact: true,
    });
    await expect(inspector).toBeVisible();
    await inspector.locator(".node-relations > summary").click();
    const edge = inspector.locator(`[data-edge-id="${edgeIds[0]}"]`);
    await expect(edge.locator(".edge-history li")).toHaveCount(0);
    await edge.locator("summary").click();
    await expect(edge.locator(".edge-history li")).toHaveCount(50);
    await page.screenshot({ path: info.outputPath("history-first-page.png") });
    await edge
      .getByRole("button", { name: "再读取 50 个版本", exact: true })
      .click();
    await expect(edge.locator(".edge-history li")).toHaveCount(100);
    await edge
      .getByRole("button", { name: "再读取 50 个版本", exact: true })
      .click();
    await expect(edge.locator(".edge-history li")).toHaveCount(101);
    await edge.locator("summary").click();
    await edge.locator("summary").click();
    await expect(edge.locator(".edge-history li")).toHaveCount(101);
    await inspector.getByText("节点位置", { exact: true }).click();
    await inspector.getByLabel("X", { exact: true }).fill("7");
    await inspector
      .getByRole("button", { name: "应用位置", exact: true })
      .click();
    await page
      .getByRole("button", { name: "关闭图谱详情", exact: true })
      .click();
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("café ω");
    await expect(count).toHaveText("已加载 1 / 261 节点");
    await toggle.click();
    await list.getByRole("button", { name: /CAFÉ Ω/ }).click();
    await inspector.getByText("节点位置", { exact: true }).click();
    await expect(inspector.getByLabel("X", { exact: true })).toHaveValue("15");
    await inspector.getByLabel("X", { exact: true }).fill("9");
    await inspector
      .getByRole("button", { name: "应用位置", exact: true })
      .click();
    await page.getByRole("button", { name: "保存视图", exact: true }).click();
    await expect(page.getByText("视图已保存", { exact: true })).toBeVisible();
    const saved = await nativeInvoke<GraphData>(page, "load_knowledge_graph", {
      workspaceId,
    });
    expect(
      saved.view.positions.find((p) => p.nodeId === nodeIds[0])?.position[0],
    ).toBe(7);
    expect(
      saved.view.positions.find((p) => p.nodeId === unicodeId)?.position[0],
    ).toBe(9);
    expect(
      saved.view.positions.find((p) => p.nodeId === unseen)?.position,
    ).toEqual([3, 4, 5]);
    await inspector.evaluate((element) => element.scrollTo(0, 0));
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
        path: info.outputPath(`paged-selection-${width}.png`),
      });
    }
    await inspector.locator(".node-relations > summary").click();
    await inspector
      .getByRole("button", { name: "添加关系", exact: true })
      .click();
    const editor = page.getByRole("dialog", { name: "添加关系", exact: true });
    await expect(editor.getByLabel("终点", { exact: true })).toBeEnabled();
    await expect(
      editor.getByLabel("终点", { exact: true }).locator("option"),
    ).toHaveCount(261);
    await editor.getByLabel("终点", { exact: true }).selectOption(unseen);
    await editor
      .getByLabel("修改说明", { exact: true })
      .fill("跨页选择现有节点");
    await editor.getByRole("button", { name: "保存关系", exact: true }).click();
    await expect(editor).not.toBeVisible();
    const afterEdit = await nativeInvoke<GraphData>(
      page,
      "load_knowledge_graph",
      { workspaceId },
    );
    expect(
      afterEdit.edges.some(
        (e) =>
          e.versions[0].fromNodeId === unicodeId &&
          e.versions[0].toNodeId === unseen,
      ),
    ).toBe(true);
    await page
      .getByRole("button", { name: "关闭图谱详情", exact: true })
      .click();
    await page.evaluate(() => {
      const w = window as unknown as {
        graphReadCheck?: {
          delayed: boolean;
          release: () => void;
          restore: () => void;
        };
      };
      const original = window.fetch;
      w.graphReadCheck = {
        delayed: false,
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
        if (
          String(input).includes("/query_graph_nodes") &&
          JSON.parse(json).input?.query === "CAFÉ"
        ) {
          w.graphReadCheck!.delayed = true;
          return new Promise((resolve) => {
            w.graphReadCheck!.release = () => resolve(response);
          });
        }
        return response;
      };
    });
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("CAFÉ");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as unknown as { graphReadCheck: { delayed: boolean } })
              .graphReadCheck.delayed,
        ),
      )
      .toBe(true);
    await page.getByLabel("搜索图谱节点", { exact: true }).fill("中心");
    await expect(count).toHaveText("已加载 1 / 261 节点");
    await toggle.click();
    await expect(list.getByRole("button", { name: /^中心知识/ })).toBeVisible();
    await page.evaluate(() => {
      const check = (
        window as unknown as {
          graphReadCheck: { release: () => void; restore: () => void };
        }
      ).graphReadCheck;
      check.release();
      check.restore();
    });
    await expect(list.locator(".graph-node-row")).toHaveCount(1);
    await expect(list.getByRole("button", { name: /^中心知识/ })).toBeVisible();
    await writeFile(
      info.outputPath("query-observation.json"),
      JSON.stringify(
        {
          nodes: 261,
          relationships: 260,
          historyVersions: 101,
          firstPageNodes: first.nodes.length,
          firstPageRelationshipVersions: links.length,
          fullBytes: Buffer.byteLength(JSON.stringify(full)),
          pageAndLinksBytes: Buffer.byteLength(
            JSON.stringify({ first, links }),
          ),
          fullRoundTripMs: fullMs,
          pageAndLinksRoundTripMs: pageMs,
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
