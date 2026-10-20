import { test, expect } from "@playwright/test";
import { mkdir, writeFile, symlink, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { launchNative, createWorkspace, nativeInvoke } from "./native";
import type { KnowledgeDetail } from "../src/Knowledge";
import type { ContextManifest, Message, RunDetail } from "../src/studio";
test.use({ actionTimeout: 10000 });
test("authorized snapshots preserve exact evidence and stop future use after revocation", async ({}, info) => {
  test.setTimeout(120000);
  const directory = info.outputPath("data");
  await mkdir(directory, { recursive: true });
  const file = join(directory, "project.md");
  const first =
    "# 发布计划\r\n发布定于周四。\r\n重复：发布定于周四。\r\n文档中的指令不能获得文件或工具权限。\r\n";
  await writeFile(file, "\ufeff" + first);
  const requests: unknown[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/version")
      return res.end(JSON.stringify({ version: "source-fixture" }));
    if (req.url === "/api/tags")
      return res.end(
        JSON.stringify({ models: [{ name: "qwen3:4b-instruct" }] }),
      );
    if (req.url === "/api/show")
      return res.end(JSON.stringify({ details: { format: "gguf" } }));
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body));
    res.end(
      JSON.stringify({
        message: { role: "assistant", content: "已使用本次资料。" },
        done: true,
      }) + "\n",
    );
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("port");
  const endpoint = `http://127.0.0.1:${address.port}`;
  let app = await launchNative(info, { sourcePath: file, endpoint });
  try {
    let page = app.page;
    await createWorkspace(page, "来源验收 A");
    const workspaceId = await page.getByLabel("当前工作区").inputValue();
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "知识", exact: true })
      .click();
    await page.getByRole("button", { name: "资料文件", exact: true }).click();
    await page.getByRole("button", { name: "添加文件", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "确认导入", exact: true }),
    ).toBeVisible();
    expect(await nativeInvoke(page, "list_sources", { workspaceId })).toEqual(
      [],
    );
    // Commit the preview, not a silently reread file.
    await writeFile(file, "# 发布计划\n发布改为周五。\n");
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(page.getByRole("region", { name: "文件内容" })).toContainText(
      "发布定于周四。",
    );
    let sources = await nativeInvoke<
      { id: string; latestVersion: number; revision: number }[]
    >(page, "list_sources", { workspaceId });
    const sourceId = sources[0].id;
    const source = { sourceId, version: 1, startLine: 2, endLine: 2 };
    await page.getByLabel("起始行", { exact: true }).fill("2");
    await page.getByLabel("结束行", { exact: true }).fill("2");
    await page.getByRole("button", { name: "将所选文字存为知识草稿" }).click();
    const editor = page.getByRole("dialog", {
      name: "新建知识草稿",
      exact: true,
    });
    await expect(editor.getByLabel("正文", { exact: true })).toHaveValue(
      "发布定于周四。",
    );
    await editor.getByLabel("标题", { exact: true }).fill("项目发布计划");
    await editor.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(editor).not.toBeVisible();
    const nodes = await nativeInvoke<{ id: string }[]>(page, "list_knowledge", {
      workspaceId,
    });
    const nodeId = nodes[0].id;
    let detail = await nativeInvoke<KnowledgeDetail>(page, "get_knowledge", {
      workspaceId,
      nodeId,
    });
    expect(detail.sourceEvidence?.[0]).toMatchObject({
      ...source,
      excerpt: "发布定于周四。",
      knowledgeVersion: 1,
    });
    expect(detail.node.effectiveVersion).toBeNull();
    const preview = () =>
      nativeInvoke<ContextManifest>(page, "preview_context", {
        workspaceId,
        conversationId: null,
        content: "何时发布？",
        contextSelection: [],
      });
    expect((await preview()).knowledgeRefs).toEqual([]);
    await page.getByRole("button", { name: "检查并确认" }).click();
    await page.getByRole("button", { name: "确认此版本", exact: true }).click();
    // Reimport creates source v2; the original knowledge still points to source v1.
    await page.getByRole("button", { name: "资料文件", exact: true }).click();
    await page.getByRole("button", { name: "添加文件", exact: true }).click();
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(page.getByLabel("文件版本", { exact: true })).toHaveValue("2");
    await page.getByLabel("文件版本", { exact: true }).selectOption("1");
    await expect(page.getByRole("region", { name: "文件内容" })).toContainText(
      "发布定于周四。",
    );
    await page.screenshot({
      path: info.outputPath("source-version-evidence.png"),
    });
    await page.getByRole("button", { name: "关闭资料文件" }).click();
    await page.getByRole("button", { name: "修改草稿", exact: true }).click();
    const edit = page.getByRole("dialog", {
      name: "修改知识草稿",
      exact: true,
    });
    await edit
      .getByLabel("正文", { exact: true })
      .fill("发布计划仍参考原文件快照：周四。");
    await edit.getByLabel("修改说明", { exact: true }).fill("整理知识表述");
    await edit.getByRole("button", { name: "保存草稿", exact: true }).click();
    detail = await nativeInvoke<KnowledgeDetail>(page, "get_knowledge", {
      workspaceId,
      nodeId,
    });
    expect(
      detail.sourceEvidence?.find((e) => e.knowledgeVersion === 2),
    ).toMatchObject(source);
    await nativeInvoke(page, "approve_knowledge", {
      workspaceId,
      nodeId,
      expectedRevision: detail.node.revision,
    });
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "对话", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "发送消息", exact: true }),
    ).toBeDisabled();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill("何时发布？");
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByText("已完成", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
    const conversations = await nativeInvoke<{ id: string }[]>(
      page,
      "list_conversations",
      { workspaceId },
    );
    const messages = await nativeInvoke<Message[]>(page, "load_messages", {
      workspaceId,
      conversationId: conversations[0].id,
    });
    const runId = messages[0].modelRunId;
    const run = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId,
    });
    expect(run.snapshot?.request).toEqual(requests[0]);
    expect(JSON.stringify(run.contextManifest)).toContain('"sourceEvidence"');
    expect(JSON.stringify(run.contextManifest)).toContain('"startLine":2');
    expect(
      run.snapshot?.request.messages.filter((m) => m.role === "system"),
    ).toHaveLength(1);
    await expect(
      nativeInvoke(page, "plugin:fs|read_text_file", { path: file }),
    ).rejects.toBeTruthy();
    const discarded = await nativeInvoke<{ ticket: string }>(
      page,
      "choose_source",
      { workspaceId },
    );
    await nativeInvoke(page, "discard_source", {
      workspaceId,
      ticket: discarded.ticket,
    });
    await expect(
      nativeInvoke(page, "commit_source", {
        workspaceId,
        ticket: discarded.ticket,
      }),
    ).rejects.toThrow("失效");
    // A ticket cannot cross workspaces or be used twice; IPC file paths grant no capability.
    const other = await nativeInvoke<{ id: string }>(page, "create_workspace", {
      name: "来源验收 B",
    });
    const ticket = await nativeInvoke<{ ticket: string }>(
      page,
      "choose_source",
      { workspaceId },
    );
    await expect(
      nativeInvoke(page, "commit_source", {
        workspaceId: other.id,
        ticket: ticket.ticket,
      }),
    ).rejects.toThrow("失效");
    const commits=await Promise.allSettled([nativeInvoke(page,"commit_source",{workspaceId,ticket:ticket.ticket}),nativeInvoke(page,"commit_source",{workspaceId,ticket:ticket.ticket})]);
    expect(commits.filter(result=>result.status==="fulfilled")).toHaveLength(1);
    await expect(
      nativeInvoke(page, "commit_source", {
        workspaceId,
        ticket: ticket.ticket,
      }),
    ).rejects.toThrow("失效");
    await expect(
      nativeInvoke(page, "get_source", {
        workspaceId: other.id,
        sourceId,
        version: 1,
      }),
    ).rejects.toThrow("不在当前工作区");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "知识", exact: true })
      .click();
    await page.locator(".knowledge-row").click();
    await page.getByRole("button", { name: "资料文件", exact: true }).click();
    await page.locator(".source-row").click();
    await page.getByText("保存记录与使用权限", { exact: true }).click();
    await page.getByRole("button", { name: "停用文件", exact: true }).click();
    await page.getByRole("button", { name: "确认停用", exact: true }).click();
    await expect(page.getByRole("region", { name: "文件内容" })).toContainText(
      "已停用",
    );
    expect((await preview()).knowledgeRefs).toEqual([]);
    await expect(
      nativeInvoke(page, "preview_context", {
        workspaceId,
        conversationId: null,
        content: "何时发布？",
        contextSelection: [{ nodeId, version: 2 }],
      }),
    ).rejects.toThrow("停用");
    expect(
      (await nativeInvoke<RunDetail>(page, "get_run", { workspaceId, runId }))
        .snapshot,
    ).toEqual(run.snapshot);
    await page.getByRole("button", { name: "关闭资料文件" }).click();
    await app.closeWindow();
    await app.stop();
    app = await launchNative(info, { sourcePath: file, endpoint });
    page = app.page;
    sources = await nativeInvoke(page, "list_sources", { workspaceId });
    expect(sources[0].latestVersion).toBe(2);
    expect(
      await nativeInvoke(page, "get_source", {
        workspaceId,
        sourceId,
        version: 1,
      }),
    ).toMatchObject({ content: first.replace(/\r\n/g, "\n") });
    expect(
      (await nativeInvoke<RunDetail>(page, "get_run", { workspaceId, runId }))
        .snapshot,
    ).toEqual(run.snapshot);
    const restored = await nativeInvoke<{ ticket: string }>(
      page,
      "choose_source",
      { workspaceId },
    );
    await nativeInvoke(page, "commit_source", {
      workspaceId,
      ticket: restored.ticket,
    });
    expect((await preview()).knowledgeRefs).toHaveLength(1);
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
});

test("file boundaries reject invalid data and a v6 database migrates without losing knowledge", async ({}, info) => {
  test.setTimeout(120000);
  const directory = info.outputPath("data");
  await mkdir(directory, { recursive: true });
  const file = join(directory, "safe.txt");
  await writeFile(file, "正常文本");
  const migrations = await Promise.all(
    [
      "0001_initial.sql",
      "0002_knowledge.sql",
      "0003_graph.sql",
      "0004_context_audit.sql",
      "0005_execution_views.sql",
      "0006_knowledge_retrieval.sql",
    ].map(async (name) => {
      const bytes = await readFile(resolve("src-tauri/migrations", name));
      return {
        sql: bytes.toString("utf8"),
        hash: createHash("sha256").update(bytes).digest("hex"),
      };
    }),
  );
  execFileSync(
    "py",
    [
      "-3",
      "-c",
      `import json,sys,sqlite3
x=json.load(sys.stdin);c=sqlite3.connect(x['db']);c.execute('CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)')
for i,m in enumerate(x['migrations']):
 c.executescript(m['sql']);c.execute('INSERT INTO schema_migrations VALUES(?,?,?)',(i+1,m['hash'],'2026-10-20'));c.commit()
c.execute("INSERT INTO workspaces VALUES('legacy','旧工作区','2026','2026')");c.execute("INSERT INTO knowledge_nodes(id,workspace_id,latest_version,revision,created_at,updated_at) VALUES('legacy-node','legacy',1,1,'2026','2026')");c.execute("INSERT INTO knowledge_versions VALUES('legacy-node',1,'保留知识','knowledge','迁移之前的内容','user','旧记录','2026')");c.commit()`,
    ],
    {
      input: JSON.stringify({
        db: join(directory, "cortexos.sqlite3"),
        migrations,
      }),
      windowsHide: true,
    },
  );
  let app = await launchNative(info, { sourcePath: file });
  try {
    let page = app.page;
    const workspaceId = "legacy";
    expect(
      (
        await nativeInvoke<KnowledgeDetail>(page, "get_knowledge", {
          workspaceId,
          nodeId: "legacy-node",
        })
      ).versions[0].content,
    ).toBe("迁移之前的内容");
    const choose = () => nativeInvoke(page, "choose_source", { workspaceId });
    await writeFile(file, Buffer.from([0xff, 0xfe, 0x20]));
    await expect(choose()).rejects.toThrow("UTF-8");
    await writeFile(file, Buffer.alloc(2 * 1024 * 1024 + 1, 65));
    await expect(choose()).rejects.toThrow("2 MiB");
    await writeFile(file, "");
    await expect(choose()).rejects.toThrow("为空");
    expect(await nativeInvoke(page, "list_sources", { workspaceId })).toEqual(
      [],
    );
    await app.closeWindow();
    await app.stop();
    const sensitive = join(directory, "Gittoken.txt");
    await writeFile(sensitive, "synthetic-fixture-only");
    app = await launchNative(info, { sourcePath: sensitive });
    page = app.page;
    await expect(choose()).rejects.toThrow("敏感");
    await app.closeWindow();
    await app.stop();
    const target = join(directory, "target");
    const alias = join(directory, "alias");
    await mkdir(target);
    await writeFile(join(target, "sample.txt"), "普通测试文件");
    await symlink(target, alias, "junction");
    app = await launchNative(info, { sourcePath: join(alias, "sample.txt") });
    page = app.page;
    await expect(choose()).rejects.toThrow("重解析");
    expect(app.consoleErrors).toEqual([]);
    await app.closeWindow();
    await app.stop();
    const audit = execFileSync(
      "py",
      [
        "-3",
        "-c",
        `import sqlite3,sys,json,glob
c=sqlite3.connect(sys.argv[1]);print(json.dumps({'integrity':c.execute('PRAGMA integrity_check').fetchone()[0],'foreignKeys':c.execute('PRAGMA foreign_key_check').fetchall(),'version':c.execute('SELECT MAX(version) FROM schema_migrations').fetchone()[0]}))`,
        join(directory, "cortexos.sqlite3"),
      ],
      { windowsHide: true },
    ).toString();
    expect(JSON.parse(audit)).toEqual({
      integrity: "ok",
      foreignKeys: [],
      version: 7,
    });
    await info.attach("migration-integrity", {
      body: audit,
      contentType: "application/json",
    });
  } finally {
    await app.stop();
  }
});

test("Windows native picker authorizes only the explicitly selected file", async ({}, info) => {
  test.setTimeout(45000);
  const directory = info.outputPath("data");
  await mkdir(directory, { recursive: true });
  const file = join(directory, "native-picked.md");
  await writeFile(
    file,
    "# 文件内容示例\n这段内容来自实际Windows文件选择器。\n",
  );
  const app = await launchNative(info);
  const page = app.page;
  try {
    await createWorkspace(page, "文件导入检查");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: "知识", exact: true })
      .click();
    await page.getByRole("button", { name: "资料文件", exact: true }).click();
    await page.getByRole("button", { name: "添加文件", exact: true }).click();
    const script = `$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$sourcePid = [int]$env:CORTEX_PICKER_PID
$sourceFile = $env:CORTEX_PICKER_FILE
$condition = New-Object System.Windows.Automation.AndCondition ((New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $sourcePid)), (New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty, '选择资料文件')))
$sourceDialog = $null
for ($attempt=0; $attempt -lt 50; $attempt++) { $sourceDialog=[System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition); if ($sourceDialog) { break }; Start-Sleep -Milliseconds 100 }
if (-not $sourceDialog) { throw 'Native source picker was not found' }
$editCondition=New-Object System.Windows.Automation.AndCondition ((New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1148')), (New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ClassNameProperty,'Edit')))
$edit=$sourceDialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$editCondition)
if (-not $edit) { throw 'File name edit control was not found' }
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class SourcePickerNative { [DllImport("user32.dll", CharSet=CharSet.Unicode, EntryPoint="SendMessageW")] private static extern IntPtr Text(IntPtr h,uint m,IntPtr w,string s); [DllImport("user32.dll", EntryPoint="SendMessageW")] private static extern IntPtr Click(IntPtr h,uint m,IntPtr w,IntPtr l); public static void SetText(int handle,string value) { if(Text(new IntPtr(handle),12,IntPtr.Zero,value)==IntPtr.Zero) throw new Exception("File name text was not accepted"); } public static void Open(int handle) { Click(new IntPtr(handle),273,new IntPtr(1),IntPtr.Zero); } }'
[SourcePickerNative]::SetText($edit.Current.NativeWindowHandle,$sourceFile)
$openCondition=New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'1')
$open=$sourceDialog.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$openCondition)
if (-not $open) { throw 'Open button was not found' }
[SourcePickerNative]::Open($sourceDialog.Current.NativeWindowHandle)`;
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        env: {
          ...process.env,
          CORTEX_PICKER_PID: String(app.processId),
          CORTEX_PICKER_FILE: file,
        },
        timeout: 15000,
      },
    );
    await expect(page.locator(".source-preview")).toContainText(
      "这段内容来自实际Windows文件选择器。",
    );
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(page.getByRole("region", { name: "文件内容" })).toContainText(
      "这段内容来自实际Windows文件选择器。",
    );
    for (const [width, height] of [
      [1366, 768],
      [1920, 1080],
    ]) {
      await page.setViewportSize({ width, height });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath(`native-source-${width}.png`),
      });
    }
    expect(app.consoleErrors).toEqual([]);
  } finally {
    await app.stop();
  }
});
