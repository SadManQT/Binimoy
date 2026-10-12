import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

if (existsSync(".env")) process.loadEnvFile(".env");

// Browser tests run against their own production-mode server on port 3100, so
// they never disturb a developer's `pnpm dev`.
const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // Each step talks to a remote database; be generous.
  timeout: 300_000,
  expect: { timeout: 60_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: BASE },
  webServer: {
    command: `pnpm --filter @lp/web build && pnpm --filter @lp/web exec next start -p ${PORT}`,
    url: `${BASE}/api/health`,
    env: { APP_URL: BASE },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
