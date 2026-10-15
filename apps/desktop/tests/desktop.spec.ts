import { chromium, expect, test } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

const development = process.env.CORTEXOS_SMOKE_DEV === "1";

test(`real Windows WebView2 ${development ? "development" : "production"} app starts and navigates`, async ({}, testInfo) => {
  test.setTimeout(development ? 120_000 : 60_000);
  const portReservation = createServer();
  await new Promise<void>((done) =>
    portReservation.listen(0, "127.0.0.1", done),
  );
  const address = portReservation.address();
  if (!address || typeof address === "string")
    throw new Error("No debugging port available");
  const port = address.port;
  await new Promise<void>((done, reject) =>
    portReservation.close((error) => (error ? reject(error) : done())),
  );

  const application = spawn(
    development
      ? process.execPath
      : resolve("src-tauri/target/debug/cortexos-desktop.exe"),
    development
      ? [
          resolve("node_modules/@tauri-apps/cli/tauri.js"),
          "dev",
          "--no-watch",
          "--config",
          JSON.stringify({ build: { beforeDevCommand: null } }),
        ]
      : [],
    {
      windowsHide: true,
      env: {
        ...process.env,
        CORTEXOS_TEST_CDP_PORT: String(port),
        WEBVIEW2_USER_DATA_FOLDER: testInfo.outputPath("webview-profile"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let processOutput = "";
  application.stdout?.on("data", (chunk) => {
    processOutput += chunk.toString();
  });
  application.stderr?.on("data", (chunk) => {
    processOutput += chunk.toString();
  });
  let launchError: Error | undefined;
  application.on("error", (error) => {
    launchError = error;
  });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  try {
    await expect
      .poll(
        async () => {
          if (launchError) throw launchError;
          if (application.exitCode !== null)
            throw new Error(
              `Desktop exited with ${application.exitCode}: ${processOutput}`,
            );
          try {
            return (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
          } catch {
            return false;
          }
        },
        { timeout: development ? 90_000 : 30_000 },
      )
      .toBe(true);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    await expect.poll(() => context.pages().length).toBeGreaterThan(0);
    const page = context.pages()[0];
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    const expectedOrigin = development
      ? /^http:\/\/127\.0\.0\.1:1420/
      : /^https?:\/\/tauri\.localhost/;
    await page.waitForURL(expectedOrigin);
    const response = await page.reload();
    const responseHeaders = await response?.allHeaders();
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
    expect(environment.url).toMatch(expectedOrigin);
    const policy = development
      ? (await fetch("http://127.0.0.1:1420")).headers.get(
          "content-security-policy",
        )
      : (environment.csp ?? responseHeaders?.["content-security-policy"]);
    const policySource = development
      ? "vite-server-response"
      : "native-response";
    expect(policy).toContain("script-src 'self'");
    expect(policy).toContain("object-src 'none'");
    await testInfo.attach("desktop-environment", {
      body: JSON.stringify(
        { ...environment, checkedPolicy: policy, policySource },
        null,
        2,
      ),
      contentType: "application/json",
    });
    console.log(
      "Native desktop environment:",
      JSON.stringify({ ...environment, checkedPolicy: policy, policySource }),
    );
    expect(failures).toEqual([]);
  } finally {
    await testInfo.attach("desktop-process-output", {
      body: processOutput,
      contentType: "text/plain",
    });
    await browser?.close();
    if (application.pid && application.exitCode === null) {
      spawnSync("taskkill", ["/PID", String(application.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    }
  }
});
