import { defineConfig } from "@trigger.dev/sdk";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_rwgdoalvitmqhclxramk",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  dirs: ["features"],
  build: {
    extensions: [
      playwright({
        // Matches @playwright/test / playwright-core pinned in package-lock.json.
        // The extension installs this exact Playwright build's Chromium so the
        // runtime `chromium.executablePath()` resolves to a real binary.
        version: "1.62.0",
        // chrome-launcher (used by Stagehand's env:"LOCAL") needs a full Chrome
        // binary, not just chromium-headless-shell, so install both.
        headless: false,
      }),
    ],
  },
});
