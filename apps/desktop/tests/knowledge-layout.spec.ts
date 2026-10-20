import { test, expect } from "@playwright/test";
import { launchNative, createWorkspace, nativeInvoke } from "./native";
import type { Bootstrap } from "../src/studio";

test("compact navigation and reading layout preserve knowledge actions", async ({}, info) => {
  const app = await launchNative(info);
  const { page } = app;
  try {
    await createWorkspace(page, "知识阅读验收");
    const data = await nativeInvoke<Bootstrap>(page, "bootstrap");
    const workspaceId = data.workspaces[0].id;
    const content =
      "本地认知工作台的知识管理\n\n知识应保留来源、修改说明和审核记录。用户修改知识后，系统保存新草稿；确认版本之后，下一次检索才会采用新的内容。\n\n阅读与追溯\n\n正文聚焦当前版本。来源记录最初的回答摘录，执行记录保留当次模型实际使用的资料。历史版本用于理解内容如何变化，不会因为切换查看而改变生效版本。\n\n实施原则\n\n先交付可以验证的功能，再逐步完善体验。每次操作应保留清晰反馈，失败时保护草稿，并允许用户返回继续编辑。";
    const id = await nativeInvoke<string>(page, "save_knowledge", {
      input: {
        workspaceId,
        nodeId: null,
        expectedRevision: null,
        title: "知识管理与版本追溯",
        kind: "knowledge",
        content,
        changeReason: "建立可追溯的知识记录",
        sourceMessageId: null,
        sourceExcerpt: null,
      },
    });
    await page.goto(
      `http://tauri.localhost/#/knowledge?workspace=${workspaceId}&node=${id}`,
    );
    await expect(
      page.locator(".knowledge-detail > .knowledge-prose"),
    ).toHaveText(content);
    await expect(page.locator(".global-rail")).toHaveCSS("width", "56px");
    await page.getByRole("link", { name: "知识", exact: true }).focus();
    await expect(
      page.locator(".rail-link[aria-current] .rail-tooltip"),
    ).toHaveCSS("opacity", "1");
    await page.getByRole("button", { name: "展开全局导航" }).click();
    await expect(
      page.getByRole("button", { name: "收起全局导航" }),
    ).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("button", { name: "收起全局导航" }).click();
    for (const [width, height] of [
      [1366, 768],
      [1600, 900],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(page.locator(".knowledge-sidebar")).toHaveCSS(
        "width",
        "260px",
      );
      const measure = await page
        .locator(".knowledge-detail > .knowledge-prose")
        .boundingBox();
      expect(measure!.width).toBeLessThanOrEqual(860);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`knowledge-reading-${width}.png`),
      });
      await page.getByRole("button", { name: "版本历史", exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "版本历史", exact: true }),
      ).toBeVisible();
      const bodyBox = await page.locator(".knowledge-detail > .knowledge-prose").boundingBox();
      const drawerBox = await page.locator(".knowledge-history-drawer").boundingBox();
      expect(bodyBox!.x + bodyBox!.width).toBeLessThanOrEqual(drawerBox!.x);
      await page.screenshot({
        path: info.outputPath(`knowledge-history-${width}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "版本历史", exact: true }),
      ).not.toBeVisible();
      await expect(
        page.getByRole("button", { name: "版本历史", exact: true }),
      ).toBeFocused();
    }
    await page.getByRole("button", { name: "收起知识列表" }).click();
    await expect(page.locator(".knowledge-sidebar")).not.toBeVisible();
    await expect(
      page.locator(".knowledge-detail > .knowledge-prose"),
    ).toHaveText(content);
    await page.getByRole("button", { name: "展开知识列表" }).click();
    await expect(page.locator(".knowledge-sidebar")).toBeVisible();
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
