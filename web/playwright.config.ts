/** Purpose: starts the local API and Vite app for real-browser acceptance. Connects: Playwright to frozen AGT1 data and the WASM worker. */
import { defineConfig } from "@playwright/test";

const isWindows = process.platform === "win32";
const apiPython = isWindows ? "..\\api\\.venv\\Scripts\\python.exe" : "../api/.venv/bin/python";
const apiDirectory = isWindows ? "..\\api" : "../api";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5173", browserName: "chromium", trace: "retain-on-failure" },
  webServer: [
    {
      command: `${apiPython} -m uvicorn app.main:app --app-dir ${apiDirectory} --host 127.0.0.1 --port 8000`,
      url: "http://127.0.0.1:8000/health",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "pnpm exec vite --host 0.0.0.0",
      url: "http://127.0.0.1:5173",
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
