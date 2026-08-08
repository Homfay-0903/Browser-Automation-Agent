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
        // 1.49.0 is the one version whose `install --dry-run` still prints the
        // old "browser: chromium" / "browser: chromium-headless-shell" blocks
        // the extension greps for, AND lists a separate headless-shell build
        // (which the extension's headless:false path also greps for). 1.48.x
        // lacks the headless-shell entry; 1.50+ switched to the Chrome for
        // Testing format. The local `playwright` devDependency must match,
        // since the extension prefers the version in the bundle's externals.
        version: "1.49.0",
        // chrome-launcher (used by Stagehand's env:"LOCAL") needs a full Chrome
        // binary, so install both chromium and chromium-headless-shell.
        headless: false,
      }),
    ],
  },
});
