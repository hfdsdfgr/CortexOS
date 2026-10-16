import { chromium, expect, type Page, type TestInfo } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";

export async function launchNative(
  testInfo: TestInfo,
  options: {
    development?: boolean;
    endpoint?: string;
    dataDirectory?: string;
    profileDirectory?: string;
  } = {},
) {
  const reservation = createServer();
  await new Promise<void>((done) => reservation.listen(0, "127.0.0.1", done));
  const address = reservation.address();
  if (!address || typeof address === "string")
    throw new Error("No debugging port available");
  const port = address.port;
  await new Promise<void>((done, reject) =>
    reservation.close((error) => (error ? reject(error) : done())),
  );
  const development = options.development ?? false;
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
        CORTEXOS_TEST_DATA_DIR:
          options.dataDirectory ?? testInfo.outputPath("data"),
        WEBVIEW2_USER_DATA_FOLDER:
          options.profileDirectory ?? testInfo.outputPath("webview-profile"),
        ...(options.endpoint
          ? { CORTEXOS_TEST_OLLAMA_URL: options.endpoint }
          : {}),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  application.stdout?.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-16000);
  });
  application.stderr?.on("data", (chunk) => {
    output = (output + chunk.toString()).slice(-16000);
  });
  let launchError: Error | undefined;
  application.on("error", (error) => {
    launchError = error;
  });
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
  const stop = async () => {
    try {
      await browser?.close();
    } catch {
      /* CDP may already be closed after a crash. */
    }
    if (application.pid && application.exitCode === null)
      spawnSync("taskkill", ["/PID", String(application.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
    await testInfo.attach("desktop-process-output", {
      body: output,
      contentType: "text/plain",
    });
  };
  const closeWindow = async () => {
    if (development || !application.pid)
      throw new Error("Window close requires the standalone test process");
    const close = spawnSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `if (-not (Get-Process -Id ${application.pid}).CloseMainWindow()) { exit 1 }`,
      ],
      { windowsHide: true, timeout: 10_000 },
    );
    expect(close.status).toBe(0);
    await expect
      .poll(() => application.exitCode, { timeout: 15_000 })
      .not.toBeNull();
  };
  try {
    await expect
      .poll(
        async () => {
          if (launchError) throw launchError;
          if (application.exitCode !== null)
            throw new Error(
              `Desktop exited with ${application.exitCode}: ${output}`,
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
    await page.waitForURL(
      development
        ? /^http:\/\/127\.0\.0\.1:1420/
        : /^https?:\/\/tauri\.localhost/,
    );
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    return { page, context, consoleErrors, stop, closeWindow };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function nativeInvoke<T>(
  page: Page,
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return page.evaluate(
    async ({ command, args }) => {
      const api = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (
              name: string,
              values: Record<string, unknown>,
            ) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      return api.invoke(command, args);
    },
    { command, args },
  ) as Promise<T>;
}

export async function createWorkspace(page: Page, name: string) {
  await page.getByRole("button", { name: "新建工作区", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "创建工作区", exact: true });
  await dialog.getByLabel("工作区名称").fill(name);
  await dialog.getByRole("button", { name: "创建工作区", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByLabel("当前工作区")).toContainText(name);
}
