import { test, expect } from "@playwright/test";

const destinations = [
  ["对话", "chat"],
  ["知识", "knowledge"],
  ["图谱", "graph"],
  ["设置", "settings"],
] as const;

test("core pages, deep links and browser back preserve a clear current location", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  for (const [name, route] of destinations) {
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`#/${route}$`));
    await expect(
      page.getByRole("heading", { level: 1, name, exact: true }),
    ).toBeVisible();
    await expect(page.locator('[aria-current="page"]')).toHaveText(name);
    await expect(page).toHaveTitle(`${name} · CortexOS`);
  }
  await page.goBack();
  await expect(
    page.getByRole("heading", { level: 1, name: "图谱", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "图谱", exact: true }),
  ).toBeVisible();
  await page.goto("/#/unknown");
  await expect(
    page.getByRole("heading", { level: 1, name: "对话", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("keyboard navigation and graph choice work; unavailable operations stay honest", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(
    page.getByRole("button", { name: "发送消息", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "图谱", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.getByRole("radio", { name: "知识关系" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "执行过程" })).toBeChecked();
  await expect(
    page.getByText("执行过程记录实际应用事件，不代表模型的内部思维。"),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "设置", exact: true })
    .click();
  await expect(
    page.getByText("浏览器仅供界面预览", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "检测连接" })).toBeDisabled();
  await expect(page.getByLabel("服务地址")).toHaveAttribute("readonly", "");
  await page.getByText("生成参数", { exact: true }).click();
  await expect(page.getByLabel("上下文长度", { exact: true })).toHaveValue(
    "4096",
  );
});

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [800, 600],
  [375, 812],
]) {
  test(`all pages remain reachable without page overflow at ${width}×${height}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height });
    for (const [name, route] of destinations) {
      await page.goto(`/#/${route}`);
      await expect(
        page.getByRole("heading", { level: 1, name, exact: true }),
      ).toBeVisible();
      const dimensions = await page.evaluate(() => {
        const main = document.querySelector("main")!;
        return {
          viewport: innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          mainWidth: main.clientWidth,
          mainContentWidth: main.scrollWidth,
        };
      });
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.mainContentWidth).toBeLessThanOrEqual(
        dimensions.mainWidth,
      );
      await page.screenshot({
        path: testInfo.outputPath(`${route}-${width}.png`),
      });
      if (route === "chat" && width <= 800)
        await page.getByRole("button", { name: "打开会话列表" }).click();
      if (route === "knowledge" && width <= 800)
        await page.getByRole("button", { name: "打开导航菜单" }).click();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "对话", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name: "对话", exact: true }),
      ).toBeVisible();
    }
  });
}
