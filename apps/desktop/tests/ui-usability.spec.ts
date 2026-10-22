import { expect, test } from "@playwright/test";

test("browser panel headers, evidence controls and keyboard dismissal remain reachable", async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 600 });
  await page.goto("/#/graph");
  await page.getByRole("button", { name: "节点列表", exact: true }).click();
  await page.getByRole("button", { name: /^项目目标 背景/ }).click();
  await page.locator(".graph-inspector details").evaluateAll(elements => elements.forEach(element => (element as HTMLDetailsElement).open = true));
  const header = page.locator(".graph-inspector > .panel-header");
  const before = await header.boundingBox();
  const scroll = await page.locator(".graph-inspector > .panel-body").evaluate(element => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  expect(scroll).toBeGreaterThan(0);
  expect((await header.boundingBox())!.y).toBe(before!.y);
  await page.screenshot({ path: info.outputPath("graph-scrolled-header.png") });
  await page.getByRole("button", { name: "关闭图谱详情", exact: true }).click();
  await page.goto("/#/chat");
  await page.setViewportSize({ width: 1366, height: 768 });
  const evidence = page.getByRole("complementary", { name: "回答依据", exact: true });
  const collapse = page.getByRole("button", { name: "收起回答依据", exact: true });
  await expect(evidence).toBeVisible();
  const panelBox = await evidence.boundingBox(), buttonBox = await collapse.boundingBox();
  expect(buttonBox!.x).toBeGreaterThan(panelBox!.x + panelBox!.width / 2);
  await page.screenshot({ path: info.outputPath("chat-evidence-controls.png") });
  await collapse.click();
  const expand = page.getByRole("button", { name: "打开回答依据", exact: true });
  await expect(expand).toBeFocused();
  await page.setViewportSize({ width: 800, height: 768 });
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(evidence).toHaveCount(0);
  await page.setViewportSize({ width: 800, height: 768 });
  await expand.click();
  await expect(page.getByRole("dialog", { name: "回答依据", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "回答依据", exact: true })).toHaveCount(0);
  await expect(expand).toBeFocused();
});

test("browser themed menus support selection, keyboard, dismissal and viewport boundaries", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const appearance = page.getByRole("combobox", { name: "外观", exact: true });
  for (const scheme of ["light", "dark"]) {
    await appearance.selectOption(scheme);
    for (const [width, height] of [[1366, 768], [1600, 900], [1920, 1080], [375, 812]]) {
      await page.setViewportSize({ width, height });
      await appearance.click();
      const menu = page.getByRole("listbox", { name: "外观选项", exact: true });
      await expect(menu).toBeVisible();
      await expect.poll(async () => { const box = await menu.boundingBox(); return box ? box.x + box.width : Infinity; }).toBeLessThanOrEqual(width);
      const box = await menu.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`menu-${scheme}-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(menu).not.toBeVisible();
      await expect(appearance).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await appearance.click();
  await page.getByRole("listbox", { name: "外观选项", exact: true }).getByRole("option", { name: "浅色", exact: true }).click();
  await expect(appearance).toHaveValue("light");
  await expect(page.locator("html")).toHaveAttribute("data-color-scheme", "light");
  await appearance.press("ArrowDown");
  await appearance.press("End");
  await appearance.press("Enter");
  await expect(appearance).toHaveValue("dark");
  await page.reload();
  await expect(appearance).toHaveValue("dark");
  await appearance.click();
  await page.getByRole("heading", { name: "欢迎使用 CortexOS" }).click();
  await expect(page.getByRole("listbox", { name: "外观选项", exact: true })).not.toBeVisible();
  expect(errors).toEqual([]);
});
