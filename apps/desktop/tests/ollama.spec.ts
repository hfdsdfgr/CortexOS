import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import { createWorkspace, launchNative, nativeInvoke } from "./native";
import type { Bootstrap, Message, ModelHealth, RunDetail } from "../src/studio";

test("installed local Ollama answers, cancels and retains conversations after restart", async ({}, testInfo) => {
  test.setTimeout(240_000);
  let application = await launchNative(testInfo);
  const artifacts = resolve("../../artifacts/phase-1");
  await mkdir(artifacts, { recursive: true });
  try {
    let { page } = application;
    const health = await nativeInvoke<ModelHealth>(page, "check_ollama");
    expect(health.version).not.toBe("test-fixture");
    const model = health.models.find(
      (item) => item.name === "qwen3:4b-instruct",
    );
    expect(model).toBeDefined();
    await createWorkspace(page, "本地模型验收");
    const startedAt = Date.now();
    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill(
        "请用三条简短建议说明：怎样为一个个人项目安排第一周开发？每条不超过四十个字。",
      );
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    const assistant = page.getByRole("article", { name: "模型回答" }).last();
    await expect(assistant.locator(".message-content")).not.toHaveText(
      "正在准备回答…",
      {
        timeout: 180_000,
      },
    );
    const firstVisibleMs = Date.now() - startedAt;
    await expect(assistant.getByText("已完成", { exact: true })).toBeVisible({
      timeout: 180_000,
    });
    const totalWallMs = Date.now() - startedAt;
    const loadedModel = execFileSync(
      resolve(process.env.LOCALAPPDATA!, "Programs/Ollama/ollama.exe"),
      ["ps"],
      { encoding: "utf8", windowsHide: true },
    );
    const gpu = execFileSync(
      "nvidia-smi",
      [
        "--query-gpu=name,driver_version,memory.total,memory.used",
        "--format=csv,noheader",
      ],
      { encoding: "utf8", windowsHide: true },
    );
    const workspaceId = (await nativeInvoke<Bootstrap>(page, "bootstrap"))
      .workspaces[0].id;
    const conversations = await nativeInvoke<{ id: string }[]>(
      page,
      "list_conversations",
      { workspaceId },
    );
    const conversationId = conversations[0].id;
    const completed = (
      await nativeInvoke<Message[]>(page, "load_messages", {
        workspaceId,
        conversationId,
      })
    ).at(-1)!;
    expect(completed.content.trim().length).toBeGreaterThan(10);
    expect(completed.content).not.toContain("<think>");
    const detail = await nativeInvoke<RunDetail>(page, "get_run", {
      workspaceId,
      runId: completed.modelRunId,
    });
    expect(detail.run.status).toBe("completed");
    expect(detail.contextManifest.retrievalUsed).toBe(true);
    const terminal = detail.events.at(-1)!;
    expect(terminal.kind).toBe("response_completed");
    const metrics = (
      terminal.payload as {
        metrics: {
          evalCount: number;
          totalDurationNs: number;
          loadDurationNs: number;
          promptEvalCount: number;
          evalDurationNs: number;
          finishReason: string;
        };
      }
    ).metrics;
    expect(metrics.evalCount).toBeGreaterThan(0);
    expect(metrics.finishReason).toBe("stop");
    await page.screenshot({ path: resolve(artifacts, "native-real-chat.png") });
    await assistant
      .getByRole("button", { name: "执行过程", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "本次回答的处理记录" })).toContainText(
      "回答完成",
    );
    await page.screenshot({
      path: resolve(artifacts, "native-real-execution.png"),
    });
    await page.getByRole("button", { name: "关闭执行详情" }).click();

    await page
      .getByRole("textbox", { name: "你的问题", exact: true })
      .fill(
        "请按编号详细列出五十项个人项目开发检查事项，每项写两句话，持续完整输出。",
      );
    await page.getByRole("button", { name: "发送消息", exact: true }).click();
    await expect(page.getByRole("article", { name: "模型回答" })).toHaveCount(
      2,
    );
    await expect(
      page
        .getByRole("article", { name: "模型回答" })
        .last()
        .locator(".message-content"),
    ).not.toHaveText("正在准备回答…", { timeout: 120_000 });
    await page.getByRole("button", { name: "停止生成", exact: true }).click();
    await expect(page.getByText("已停止", { exact: true })).toBeVisible();
    const cancelled = (
      await nativeInvoke<Message[]>(page, "load_messages", {
        workspaceId,
        conversationId,
      })
    ).at(-1)!;
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.content.length).toBeGreaterThan(0);
    expect(application.consoleErrors).toEqual([]);
    await application.stop();
    application = await launchNative(testInfo);
    page = application.page;
    await expect(page.getByText("已停止", { exact: true })).toBeVisible();
    const persisted = await nativeInvoke<Message[]>(page, "load_messages", {
      workspaceId,
      conversationId,
    });
    expect(persisted.at(-1)!.content).toBe(cancelled.content);
    expect(persisted.find((item) => item.id === completed.id)!.content).toBe(
      completed.content,
    );
    let offlineRecoveryVerified = false;
    let restartedServerPid: number | undefined;
    if (process.env.CORTEXOS_MANAGED_OLLAMA_PID) {
      await expect(
        page.getByText("Ollama 已连接", { exact: true }),
      ).toBeVisible();
      const managedPid = Number(process.env.CORTEXOS_MANAGED_OLLAMA_PID);
      if (!Number.isSafeInteger(managedPid) || managedPid <= 0)
        throw new Error("Invalid managed Ollama PID");
      const executable = resolve(
        process.env.LOCALAPPDATA!,
        "Programs/Ollama/ollama.exe",
      );
      const managed = JSON.parse(
        execFileSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `$service = Get-Process -Id ${managedPid}; $listener = Get-NetTCPConnection -LocalPort 11434 -State Listen; @{ Path = $service.Path; OwnsPort = ($listener.OwningProcess -contains ${managedPid}) } | ConvertTo-Json -Compress`,
          ],
          { encoding: "utf8", windowsHide: true },
        ),
      );
      expect(managed.Path.toLowerCase()).toBe(executable.toLowerCase());
      expect(managed.OwnsPort).toBe(true);
      execFileSync("taskkill", ["/PID", String(managedPid), "/T", "/F"], {
        windowsHide: true,
      });
      try {
        await page
          .getByRole("textbox", { name: "你的问题", exact: true })
          .fill("服务停止后检查");
        await page
          .getByRole("button", { name: "发送消息", exact: true })
          .click();
        await expect(page.getByRole("alert")).toContainText(
          "无法连接本地 Ollama",
        );
        expect(
          (
            await nativeInvoke<Message[]>(page, "load_messages", {
              workspaceId,
              conversationId,
            })
          ).at(-1)!.status,
        ).toBe("failed");
      } finally {
        const server = spawn(executable, ["serve"], {
          detached: true,
          windowsHide: true,
          stdio: "ignore",
          env: {
            ...process.env,
            OLLAMA_HOST: "127.0.0.1:11434",
            OLLAMA_NO_CLOUD: "1",
            OLLAMA_CONTEXT_LENGTH: "4096",
            OLLAMA_NUM_PARALLEL: "1",
            OLLAMA_MAX_LOADED_MODELS: "1",
            OLLAMA_KEEP_ALIVE: "5m",
          },
        });
        server.unref();
        restartedServerPid = server.pid;
        await expect
          .poll(
            async () => {
              try {
                return (await fetch("http://127.0.0.1:11434/api/version")).ok;
              } catch {
                return false;
              }
            },
            { timeout: 15_000 },
          )
          .toBe(true);
      }
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "设置", exact: true })
        .click();
      await page.getByRole("button", { name: "检测连接", exact: true }).click();
      await expect(
        page.getByText(`Ollama ${health.version} 已连接`, { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("navigation")
        .getByRole("link", { name: "对话", exact: true })
        .click();
      const answersBeforeRecovery = await page
        .getByRole("article", { name: "模型回答" })
        .count();
      await page
        .getByRole("textbox", { name: "你的问题", exact: true })
        .fill("请只回复：本地服务已恢复。");
      await page.getByRole("button", { name: "发送消息", exact: true }).click();
      await expect(page.getByRole("article", { name: "模型回答" })).toHaveCount(
        answersBeforeRecovery + 1,
      );
      await expect(
        page
          .getByRole("article", { name: "模型回答" })
          .last()
          .getByText("已完成", { exact: true }),
      ).toBeVisible({ timeout: 120_000 });
      offlineRecoveryVerified = true;
    }
    const report = {
      version: health.version,
      model,
      firstVisibleMs,
      totalWallMs,
      metrics,
      tokensPerSecond: metrics.evalCount / (metrics.evalDurationNs / 1e9),
      cancelledCharacters: cancelled.content.length,
      restartPreserved: true,
      loadedModel: loadedModel.trim(),
      gpu: gpu.trim(),
      offlineRecoveryVerified,
      restartedServerPid,
    };
    await writeFile(
      resolve(artifacts, "real-model-report.json"),
      JSON.stringify(report, null, 2),
    );
    console.log("Real local model acceptance:", JSON.stringify(report));
    expect(application.consoleErrors).toEqual([]);
  } finally {
    await application.stop();
  }
});
