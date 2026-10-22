import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { launchNative, createWorkspace, nativeInvoke } from "./native";
import { seedGraph } from "./graph-fixture";
import type { GraphData } from "../src/graph-data";

const run = promisify(execFile);
const bundle = resolve("src-tauri/target/debug/bundle/nsis");
const dbScript = resolve("tests/delivery-db.py");
const artifacts = resolve("../../artifacts");

test("isolated NSIS upgrade preserves saved data and migrates a v6 fixture", async ({}, info) => {
  test.setTimeout(240000);
  const installDirectory = info.outputPath("installed");
  const inside = relative(artifacts, installDirectory);
  if (inside.startsWith("..") || isAbsolute(inside))
    throw Error("Install outside artifacts refused");
  const executable = join(installDirectory, "cortexos-desktop.exe");
  const evidence: Record<string, unknown> = {
    scope:
      "same source, debug companion installers with isolated identity; not historical release compatibility",
    installs: [],
  };
  const install = async (version: string) => {
    const path = join(
      bundle,
      `CortexOS Delivery Check_${version}_x64-setup.exe`,
    );
    const sha256 = createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
    await run(path, ["/S", "/NS", `/D=${installDirectory}`], {
      windowsHide: true,
      timeout: 90000,
    });
    const { stdout } = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `(Get-Item -LiteralPath '${executable.replace(/'/g, "''")}').VersionInfo.ProductVersion`,
      ],
      { windowsHide: true },
    );
    expect(stdout.trim()).toBe(version);
    (evidence.installs as unknown[]).push({
      version,
      sha256,
      exitCode: 0,
      installedProductVersion: stdout.trim(),
    });
  };
  const snapshot = async (directory: string) =>
    JSON.parse(
      (
        await run(
          "py",
          [
            "-3",
            "-X",
            "utf8",
            dbScript,
            "snapshot",
            join(directory, "cortexos.sqlite3"),
          ],
          { windowsHide: true },
        )
      ).stdout,
    );
  const dataDirectory = info.outputPath("data");
  await mkdir(dataDirectory, { recursive: true });
  const sourcePath = join(dataDirectory, "delivery.md");
  await writeFile(sourcePath, "# 内部交付检查\n升级后仍须能定位这份副本。\n");
  // Real HTTP transport, synthetic answer. No claim about Ollama throughput.
  const { createServer } = await import("node:http");
  const server = createServer(async (req, res) => {
    const json = (value: unknown) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(value));
    };
    if (req.url === "/api/version")
      return json({ version: "delivery-fixture" });
    if (req.url === "/api/tags")
      return json({ models: [{ name: "qwen3:4b-instruct" }] });
    if (req.url === "/api/show") return json({ details: { format: "gguf" } });
    for await (const part of req) void part;
    res.setHeader("Content-Type", "application/x-ndjson");
    res.end(
      JSON.stringify({
        message: { role: "assistant", content: "升级前已保存的回答。" },
        done: true,
        done_reason: "stop",
      }) + "\n",
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No fixture port");
  const endpoint = `http://127.0.0.1:${address.port}`;
  let app: Awaited<ReturnType<typeof launchNative>> | undefined;
  try {
    await install("0.0.9");
    app = await launchNative(info, {
      executable,
      dataDirectory,
      sourcePath,
      endpoint,
    });
    await createWorkspace(app.page, "安装升级检查");
    const workspaceId = await app.page.getByLabel("当前工作区").inputValue();
    const { nodeIds } = await seedGraph(app.page, workspaceId, 3, 2);
    await nativeInvoke(app.page, "approve_knowledge", {
      workspaceId,
      nodeId: nodeIds[0],
      expectedRevision: 1,
    });
    await nativeInvoke(app.page, "save_knowledge", {
      input: {
        workspaceId,
        nodeId: nodeIds[0],
        expectedRevision: 2,
        title: "中心知识的新草稿",
        kind: "context",
        content: "新草稿不能覆盖旧生效版本。",
        changeReason: "检查升级保留历史与审核状态",
        sourceMessageId: null,
        sourceExcerpt: null,
      },
    });
    await nativeInvoke(app.page, "save_graph_view", {
      input: {
        workspaceId,
        expectedRevision: 0,
        camera: [0, 9, 22],
        target: [0, 0, 0],
        positions: [{ nodeId: nodeIds[0], position: [1, 2, 3] }],
      },
    });
    const preview = await nativeInvoke<{ ticket: string }>(
      app.page,
      "choose_source",
      { workspaceId },
    );
    await nativeInvoke(app.page, "commit_source", {
      workspaceId,
      ticket: preview.ticket,
    });
    await app.page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("这条合成问题用于升级检查。");
    await app.page
      .getByRole("button", { name: "发送消息", exact: true })
      .click();
    await expect(app.page.getByText("已完成", { exact: true })).toBeVisible();
    const graph = await nativeInvoke<GraphData>(
      app.page,
      "load_knowledge_graph",
      { workspaceId },
    );
    expect(graph.view.positions[0].position).toEqual([1, 2, 3]);
    await app.closeWindow();
    await app.stop();
    app = undefined;
    const before = await snapshot(dataDirectory);
    expect(before.tables.messages.rows).toBe(2);
    expect(before.tables.source_versions.rows).toBe(1);
    expect(before.tables.knowledge_edge_versions.rows).toBe(2);
    expect(before.tables.knowledge_versions.rows).toBe(4);
    expect(before.tables.knowledge_approval_events.rows).toBe(1);
    await install("0.1.0");
    expect(await snapshot(dataDirectory)).toEqual(before);
    app = await launchNative(info, {
      executable,
      dataDirectory,
      sourcePath,
      endpoint,
    });
    expect(
      await nativeInvoke(app.page, "load_knowledge_graph", { workspaceId }),
    ).toEqual(graph);
    await expect(
      app.page.getByText("升级前已保存的回答。", { exact: true }),
    ).toBeVisible();
    const ax = await app.context.newCDPSession(app.page);
    const tree = await ax.send("Accessibility.getFullAXTree");
    const names = tree.nodes
      .filter((n) => !n.ignored)
      .map((n) => n.name?.value);
    for (const name of ["你的问题", "发送消息", "最大化窗口", "新建工作区"])
      expect(names).toContain(name);
    evidence.accessibility = {
      kind: "WebView2 accessibility tree, not a screen reader session",
      checkedNames: ["你的问题", "发送消息", "最大化窗口", "新建工作区"],
    };
    const maximize = app.page.getByRole("button", {
      name: "最大化窗口",
      exact: true,
    });
    await maximize.focus();
    await app.page.keyboard.press("Enter");
    const restore = app.page.getByRole("button", {
      name: "还原窗口",
      exact: true,
    });
    await expect(restore).toBeVisible();
    await restore.focus();
    await app.page.keyboard.press("Enter");
    await expect(maximize).toBeVisible();
    // Real HWND resize, no CDP viewport/device emulation and no system setting changes.
    const nativeWindow = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
Add-Type @'
using System; using System.Runtime.InteropServices;
public class DeliveryWindow {
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out Rect r);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int w, int height, uint flags);
}
'@
$handle = (Get-Process -Id ${app.processId}).MainWindowHandle
$beforeRect = New-Object DeliveryWindow+Rect
[void][DeliveryWindow]::GetWindowRect($handle, [ref]$beforeRect)
if (-not [DeliveryWindow]::SetWindowPos($handle, [IntPtr]::Zero, 60, 60, 1200, 800, 20)) { throw 'Native resize failed' }
$afterRect = New-Object DeliveryWindow+Rect
[void][DeliveryWindow]::GetWindowRect($handle, [ref]$afterRect)
@{ dpi=[DeliveryWindow]::GetDpiForWindow($handle); before=$beforeRect; after=$afterRect } | ConvertTo-Json -Depth 3
`,
      ],
      { windowsHide: true, timeout: 15000 },
    );
    evidence.nativeWindow = JSON.parse(nativeWindow.stdout);
    await expect
      .poll(() => app!.page.evaluate(() => innerWidth))
      .toBeLessThan(1440);
    expect(
      await app.page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    evidence.webview = await app.page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
      url: location.href,
    }));
    await app.page.screenshot({
      path: info.outputPath("installed-native-window.png"),
    });
    expect(app.consoleErrors).toEqual([]);
    await app.closeWindow();
    await app.stop();
    app = undefined;
    expect(await snapshot(dataDirectory)).toEqual(before);
    evidence.savedData = before;

    const migrationDirectory = info.outputPath("migration-data");
    const seeded = JSON.parse(
      (
        await run(
          "py",
          [
            "-3",
            "-X",
            "utf8",
            dbScript,
            "seed-v6",
            join(migrationDirectory, "cortexos.sqlite3"),
          ],
          { windowsHide: true },
        )
      ).stdout,
    );
    app = await launchNative(info, {
      executable,
      dataDirectory: migrationDirectory,
      endpoint,
    });
    await expect(app.page.getByLabel("当前工作区")).toContainText(
      "升级前的工作区",
    );
    const oldGraph = await nativeInvoke<GraphData>(
      app.page,
      "load_knowledge_graph",
      { workspaceId: "delivery-v6" },
    );
    expect(oldGraph.nodes[0].title).toBe("升级前的知识");
    await app.closeWindow();
    await app.stop();
    app = undefined;
    const migrated = await snapshot(migrationDirectory);
    expect(migrated.schemaVersion).toBe(7);
    for (const table of ["workspaces", "knowledge_nodes", "knowledge_versions"])
      expect(migrated.tables[table]).toEqual(seeded.tables[table]);
    const backups = (await readdir(migrationDirectory)).filter(
      (n) => n.startsWith("before-migration-7-") && n.endsWith(".sqlite3"),
    );
    expect(backups).toHaveLength(1);
    const backup = JSON.parse(
      (
        await run(
          "py",
          [
            "-3",
            "-X",
            "utf8",
            dbScript,
            "snapshot",
            join(migrationDirectory, backups[0]),
          ],
          { windowsHide: true },
        )
      ).stdout,
    );
    expect(backup).toEqual(seeded);
    evidence.migration = {
      from: 6,
      to: 7,
      backup: backups[0],
      backupMatchesOriginal: true,
      oldRecordsRetained: true,
      integrity: migrated.integrity,
      foreignKeys: migrated.foreignKeys,
    };
    // Default silent uninstallation leaves app data unchecked; isolated files stay as evidence.
    await run(
      join(installDirectory, "uninstall.exe"),
      ["/S", `_?=${installDirectory}`],
      { windowsHide: true, timeout: 90000 },
    );
    await expect(access(executable)).rejects.toThrow();
    expect(await snapshot(dataDirectory)).toEqual(before);
    evidence.uninstall = { exitCode: 0, isolatedDataRetained: true };
  } finally {
    await app?.stop();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await writeFile(
      info.outputPath("delivery-evidence.json"),
      JSON.stringify(evidence, null, 2),
    );
  }
});
