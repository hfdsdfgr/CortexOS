import { expect, type Page } from "@playwright/test";

export async function loadAllGraphNodes(page: Page) {
  const more = page.getByRole("button", {
    name: "继续加载 200 个节点",
    exact: true,
  });
  const count = page.locator(".graph-visible-count");
  const loaded = async () =>
    Number((await count.textContent())?.match(/已加载 (\d+)/)?.[1] ?? 0);
  while (await more.isVisible()) {
    const before = await loaded();
    await expect(more).toBeEnabled();
    await more.click();
    await expect.poll(loaded).toBeGreaterThan(before);
  }
}

// Synthetic data goes through the same scoped commands as the application.
export async function seedGraph(
  page: Page,
  workspaceId: string,
  count: number,
  edgeCount: number,
  star = false,
) {
  return page.evaluate(
    async ({ workspaceId, count, edgeCount, star }) => {
      const invoke = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: <T>(command: string, args: unknown) => Promise<T>;
          };
        }
      ).__TAURI_INTERNALS__.invoke;
      const nodeIds: string[] = [];
      for (let index = 0; index < count; index++) {
        nodeIds.push(
          await invoke<string>("save_knowledge", {
            input: {
              workspaceId,
              nodeId: null,
              expectedRevision: null,
              title:
                index === 0
                  ? "中心知识"
                  : `关联条目 ${String(index).padStart(3, "0")}`,
              kind: index === 0 ? "context" : "knowledge",
              content: `合成图谱资料 ${index}。`,
              changeReason: "隔离图谱检查",
              sourceMessageId: null,
              sourceExcerpt: null,
            },
          }),
        );
      }
      const edgeIds: string[] = [];
      for (let index = 0; index < edgeCount; index++) {
        const from = star ? 0 : index % count;
        const to = star
          ? index + 1
          : (from + Math.floor(index / count) + 1) % count;
        edgeIds.push(
          await invoke<string>("save_knowledge_edge", {
            input: {
              workspaceId,
              edgeId: null,
              expectedVersion: null,
              fromNodeId: nodeIds[from],
              toNodeId: nodeIds[to],
              relation: "supports",
              active: true,
              changeReason: "合成关系，用于测量和检查",
            },
          }),
        );
      }
      return { nodeIds, edgeIds };
    },
    { workspaceId, count, edgeCount, star },
  );
}
