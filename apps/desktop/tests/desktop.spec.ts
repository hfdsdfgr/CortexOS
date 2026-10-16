import { expect, test } from "@playwright/test";
import { launchNative } from "./native";

const development = process.env.CORTEXOS_SMOKE_DEV === "1";

test(`real Windows WebView2 ${development ? "development" : "production"} app starts and navigates`, async ({}, testInfo) => {
  test.setTimeout(development ? 120_000 : 60_000);
  const application = await launchNative(testInfo, { development });
  const { page } = application;
  try {
    const response = await page.reload();
    const headers = await response?.allHeaders();
    for (const name of ["对话", "知识", "图谱", "设置"]) {
      await page
        .getByRole("navigation")
        .getByRole("link", { name, exact: true })
        .click();
      await expect(
        page.getByRole("heading", { level: 1, name, exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`desktop-${name}.png`),
      });
    }
    const environment = await page.evaluate(() => ({
      url: location.href,
      width: innerWidth,
      height: innerHeight,
      pixelRatio: devicePixelRatio,
      csp: document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute("content"),
    }));
    const policy = development
      ? (await fetch("http://127.0.0.1:1420")).headers.get(
          "content-security-policy",
        )
      : (environment.csp ?? headers?.["content-security-policy"]);
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    await testInfo.attach("desktop-environment", {
      body: JSON.stringify(
        {
          ...environment,
          checkedPolicy: policy,
          policySource: development
            ? "vite-server-response"
            : "native-response",
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    console.log("Native desktop environment:", JSON.stringify(environment));
    expect(application.consoleErrors).toEqual([]);
  } finally {
    await application.stop();
  }
});
