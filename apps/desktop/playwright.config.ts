import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:1420",
    channel: "msedge",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm.cmd run dev",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: "edge", testMatch: ["app.spec.ts", "graph-preview.spec.ts"] },
    {
      name: "desktop",
      testMatch: [
        "desktop.spec.ts",
        "chat.spec.ts",
        "context.spec.ts",
        "knowledge.spec.ts",
        "graph.spec.ts",
      ],
    },
    ...(process.env.CORTEXOS_REAL_CONTEXT === "1"
      ? [{ name: "real-context", testMatch: "context-real.spec.ts" }]
      : []),
    ...(process.env.CORTEXOS_REAL_OLLAMA === "1"
      ? [{ name: "ollama", testMatch: "ollama.spec.ts" }]
      : []),
  ],
});
