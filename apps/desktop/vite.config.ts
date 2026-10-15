import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tauriConfig from "./src-tauri/tauri.conf.json" with { type: "json" };

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    headers: { "Content-Security-Policy": tauriConfig.app.security.devCsp },
    watch: { ignored: ["**/src-tauri/**"] },
    fs: { strict: true },
  },
  preview: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: { target: "chrome105" },
});
