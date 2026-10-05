import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1366, height: 768 },
    channel: "msedge",
    headless: true,
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1",
    port: 5173,
    reuseExistingServer: true,
  },
});
