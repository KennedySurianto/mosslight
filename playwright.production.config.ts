import { defineConfig } from "@playwright/test";
export default defineConfig({
  outputDir: "test-results/production",
  testDir: "./tests/production",
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1920, height: 1080 },
    channel: "msedge",
    headless: true,
  },
  webServer: {
    command:
      "node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: true,
  },
  reporter: [["list"]],
});
