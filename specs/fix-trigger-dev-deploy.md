# Trigger.dev 部署问题排查与修复全记录

> 2026-08-08 · 状态：**已解决**（生产版本已正常，Agent 节点可运行）
> 项目：Browser Automation Agent（Next.js 16 + Trigger.dev 4.5.x + Stagehand）

---

## 一、背景与目标

项目由两部分组成：

| 部分 | 作用 | 部署位置 |
|------|------|---------|
| Next.js 应用 | 前端 / 工作流画布 / 触发运行 | Railway |
| Trigger.dev worker | 执行 `features/` 下的任务（Stagehand 浏览器自动化） | Trigger.dev 云端 |

本次要解决的核心问题：**Trigger.dev worker 无法成功部署，以及部署后 Agent 节点无法启动浏览器**。

---

## 二、部署架构

```
GitHub push (main)
   │
   ▼
.github/workflows/deploy-trigger.yml   ← 路径过滤 features/**、trigger.config.ts、package*.json
   │
   ├─ npm ci                          (npm 11.16.0，与本地生成 lockfile 的版本一致)
   │
   └─ npm run deploy:trigger          =  trigger.dev deploy
                                          │
                                          ├─① 本地 esbuild 打包 features/ 代码
                                          ├─② 上传 bundle 到 Trigger.dev
                                          └─③ 云端 Docker(Depot) 构建 worker 镜像
                                              ├─ 拉取 node:21.7.3-bookworm-slim 基础镜像
                                              ├─ 执行 trigger.config.ts 里 build.extensions 的指令
                                              └─ 镜像推送成功后 → 版本 READY → promote 为当前版本
```

**关键认知**：`trigger.dev deploy` 在**上传完 bundle 后可能仍会等待云端构建结果**——如果云端构建失败，命令会以非零码退出；即使命令退出 0，也不代表镜像构建一定成功（构建是异步的，失败时版本停在 `PENDING`）。

---

## 三、症状与迭代过程（时间线）

### 阶段 0：最初症状
- `npx trigger.dev@latest deploy` 报错：
  ```
  Building version 20260808.1: #5 [auth] registry-1.docker.io not responding during authorization, retrying (attempt 7)
  ```
- GitHub Actions 部署"显示成功"，但面板里版本一直 `PENDING_VERSION`（构建超时 `build timeout`）。
- 应用本身（Railway）能跑，但调用 workflow 时功能异常。

### 阶段 1：版本与配置清理（提交 `90c01eb`）
发现的问题：
1. **版本不一致**：`package.json` 里 `@trigger.dev/sdk`/`build`/`core` 写 4.5.10，但 `package-lock.json` 全部锁 4.5.7，且 `overrides` 强制 core→4.5.7。
2. **EOVERRIDE**：override 与直接依赖精确版本冲突，本地 `npx trigger.dev` 直接报错。
3. **Sentry 插件**：`trigger.config.ts` 里 `sentryEsbuildPlugin` 在 deploy 构建阶段上传 source map，但 `SENTRY_AUTH_TOKEN` 未配置（定时炸弹）。

修复：统一 4.5.10、删除 override、移除 Sentry 插件（`@sentry/esbuild-plugin` 及 workflow 里的 `SENTRY_AUTH_TOKEN`）、重新生成 lockfile。

### 阶段 2：bin 名错误（提交 `2a46f10`）
CI 报 `sh: 1: trigger.dev: not found`。
- 原因：`trigger.dev` 包声明的 bin 名是 **`trigger`**，不是 `trigger.dev`。`npx trigger.dev` 能用是因为 npx 按包名解析到 bin；但 npm script 里的 `trigger.dev deploy` 只会找名为 `trigger.dev` 的可执行文件。
- 修复：`package.json` 里 `"deploy:trigger": "trigger.dev deploy"` → `"trigger deploy"`。

### 阶段 3：lockfile 在 npm 11 下报错
CI `npm ci` 报 `Missing: utf-8-validate@5.0.10 / @sinclair/typebox@0.34.52 from lock file`。
- 原因：本地用 **npm 8** 生成的 lockfile，CI 用 **npm 11**（workflow 里 `npm install -g npm@11.16.0`），npm 11 对 lockfile 一致性校验更严。
- 修复：`npx npm@11.16.0 ci --dry-run` 验证 + 重新生成 lockfile，确认嵌套条目（`utf-8-validate@5.0.10`、`typebox@0.34.52` 等）齐全。

### 阶段 4：Agent 节点 `CHROME_PATH` 报错（提交 `74d1fe1`）
部署终于跑通一次（Docker Hub 撞上可用窗口），但运行含 **Agent 节点** 的 workflow 时报：
```
The CHROME_PATH environment variable must be set to a Chrome/Chromium executable no older than Chrome stable.
```
- 原因：Agent/Act 节点用 Stagehand `env: "LOCAL"` 启动浏览器，底层是 **chrome-launcher**。它找 Chrome 的顺序：`executablePath`（没传）→ `CHROME_PATH`（没设）→ 系统探测（worker 容器里没有）→ 报错。本地开发时你的 Windows 有系统 Chrome，云端容器里啥都没有。
- 初步修复：加 `@trigger.dev/build/extensions/playwright` 扩展装 Chromium + 运行时用 `playwright.chromium.executablePath()` 解析路径。

### 阶段 5：追问根因（排除"代码问题"假设）
- 提出假设：是否 Trigger.dev 构建机连不上 Docker Hub 是"基础设施问题"，不太可能只有我遇到。
- **关键实验**：把之前**成功过**的版本（`2a46f10`，无任何 build.extensions）用 worktree 原样重新部署 → **同样卡在 `docker/dockerfile:1` 授权重试**。
- 结论：同一份成功代码现在也失败 → **不是代码问题**，是构建机到 Docker Hub 的**间歇性连通问题**（有时撞上窗口就成功，如阶段 4 那一次）。

### 阶段 6：真正的构建阻塞点——playwright 扩展解析 bug（提交 `2536f47` → `921bb98`）
Docker Hub 恢复后，构建继续走，但卡在扩展自己的步骤：
```
grep -A5 -m1 "browser: chromium" /tmp/browser-info.txt        ← 失败（1.62.0 格式不匹配）
grep -A5 -m1 "browser: chromium-headless-shell" ...           ← 失败（1.48.0 无此条目）
```
- 根因：`@trigger.dev/build` 的 playwright 扩展用 `grep "browser: chromium[(-headless-shell)]"` 解析 `playwright install --dry-run` 的输出。但 playwright 的输出格式随版本变化：

  | playwright 版本 | dry-run 输出 | 扩展能否解析 |
  |----------------|-------------|------------|
  | ≤ 1.48.x | 旧格式 `browser: chromium`，**无** headless-shell 条目 | chromium ✓，headless-shell ✗ |
  | **1.49.0** | 旧格式，且**有** `browser: chromium-headless-shell` | 两者都 ✓ ✅ |
  | ≥ 1.50 | Chrome for Testing 新格式（`Chrome for Testing ... (playwright chromium v…)`），无 `browser:` 前缀 | 都 ✗ |

- **结论：只有 playwright 1.49.0 是"旧格式 + 同时列出 headless-shell"的版本**。
- 修复：把 `playwright` 版本从 1.62.0 降到 **1.49.0**（`trigger.config.ts` 的扩展 `version` **和** `package.json` 的 devDependency 都要改——因为扩展优先用 bundle 里检测到的版本 `playwrightExternal?.version ?? options.version`）。

### 阶段 7：部署成功（提交 `921bb98`）
- CI Run #6 全绿，`trigger.dev deploy` 退出 0 → 镜像构建成功、推送、**promote 为当前版本**。
- 本地验证时曾出现 `Cannot promote a deployment that is older than the current deployment`——这是本地 deploy 与 CI 并发部署的**良性竞态**（本地版本号比 CI 的旧，Trigger.dev 不允许旧版本覆盖新版本），**不是构建失败**。

---

## 四、根因总结（分层）

| 层 | 根因 | 是否代码问题 | 状态 |
|----|------|------------|------|
| 构建基础设施 | Trigger.dev 云端构建机(Depot) ↔ Docker Hub 授权服务**间歇性**连通问题（`registry-1.docker.io not responding`，连最基础的 `docker/dockerfile:1` 前端镜像都拉不动） | 否（对方侧） | 撞可用窗口即可；已联系官方 |
| **playwright 扩展解析 bug** | `@trigger.dev/build` 的 playwright 扩展用旧格式 grep 解析 dry-run，只有 **1.49.0** 兼容 | **是（版本号）** | ✅ 锁定 1.49.0 |
| 版本错乱 | package.json / lockfile / overrides 不一致 → EOVERRIDE | 是 | ✅ 统一 4.5.10 |
| bin 名 | npm script 写 `trigger.dev`，实际 bin 是 `trigger` | 是 | ✅ 改 `trigger deploy` |
| lockfile | npm 8 生成 vs CI npm 11 严格校验 → "Missing from lock file" | 是 | ✅ 重新生成 |
| Sentry 插件 | deploy 构建带未配置 token 的 source-map 上传插件 | 是 | ✅ 移除 |
| 云端无浏览器 | Stagehand `env:"LOCAL"` 依赖 chrome-launcher 找 Chrome，容器里没有 | 是 | ✅ 扩展装 Chromium + 运行时解析 |

---

## 五、最终解决方案（关键代码）

### 1. `trigger.config.ts` —— 用 playwright 扩展装 Chromium

```ts
import { defineConfig } from "@trigger.dev/sdk";
import { playwright } from "@trigger.dev/build/extensions/playwright";

export default defineConfig({
  project: "proj_rwgdoalvitmqhclxramk",
  runtime: "node",
  // ...
  dirs: ["features"],
  build: {
    extensions: [
      playwright({
        version: "1.49.0", // 见上文：唯一同时兼容扩展 grep 且有 headless-shell 条目的版本
        headless: false,    // chrome-launcher 需要完整 Chrome，装 chromium + headless-shell 两者
      }),
    ],
  },
});
```

### 2. `package.json` —— devDependency 版本必须一致

```jsonc
"devDependencies": {
  // 扩展优先用 bundle 里检测到的版本（playwrightExternal?.version ?? options.version），
  // 所以本地 devDependency 版本必须与扩展 version 一致
  "playwright": "1.49.0"
}
```

### 3. `features/workflows/tasks/run-workflow.ts` —— 运行时解析 Chromium 路径

```ts
import { existsSync } from "node:fs"

// Stagehand 构建前：
let chromePath = process.env.CHROME_PATH          // ① 显式指定的 CHROME_PATH 优先
if (!chromePath) {
  try {
    const { chromium } = await import("playwright")
    const candidate = chromium.executablePath()   // ② playwright 装的 Chromium
    // 只在二进制真实存在时才用；本地开发没装 playwright 浏览器就回退系统 Chrome
    if (existsSync(candidate)) chromePath = candidate
  } catch { /* 保持 undefined，交给 chrome-launcher 找系统 Chrome */ }
}

stagehand = new Stagehand({
  env: "LOCAL",
  model: modelConfig,
  localBrowserLaunchOptions: {
    headless: true,
    executablePath: chromePath,   // ③ 显式传给 chrome-launcher
    args: ["--disable-features=WebSocketPermessageDeflate", "--no-sandbox", "--disable-dev-shm-usage"],
  },
  disablePino: true,
})
```

---

## 六、部署命令

| 场景 | 命令 |
|------|------|
| 手动部署（本地 CLI，已登录） | `npm run deploy:trigger`（等价 `trigger deploy` / `npx trigger.dev deploy`） |
| CI 自动部署 | push main 触发 `.github/workflows/deploy-trigger.yml` |
| 本地验证打包（不真正部署） | `trigger deploy --dry-run` |
| 需要 CI 用到的 token | `TRIGGER_ACCESS_TOKEN`（GitHub secret 已配置） |

> 注意：本机若装了 Docker，可用 `trigger deploy --local-build` 在本机构建镜像后上传，绕开云端构建机（当前未装 Docker，未采用）。

---

## 七、网络代理（VPN 全局模式）的作用与边界

排查过程中开启过 VPN 全局模式（`ping google.com` 可通）。结论要分清作用边界：

- ✅ **影响你本机到外网的连通性**：验证了本机到 `registry-1.docker.io`（返回 401，即可达）、`auth.docker.io`（返回 404，同样可达）是通的；也让本地 `npm install` / playwright 下载更稳。
- ❌ **不影响 Trigger.dev 云端构建机**：云端构建跑在 Trigger.dev 的 Depot 机器上，不经过你的 VPN。**所以开 VPN 不会直接让云端构建连上 Docker Hub。**
- 那为什么"开了 VPN 后部署就成功了"？**时间上的巧合**：真正让构建通过的是 playwright 1.49.0 修复 + 那次恰好撞上了 Docker Hub 的可用窗口，而非 VPN。

**判断网络可达的快速方法**（本机）：
```bash
curl -sI --connect-timeout 10 https://registry-1.docker.io/v2/   # 401=可达(需鉴权)，超时=不通
curl -sI --connect-timeout 10 https://auth.docker.io/             # 404=可达(根路径正常)
```

---

## 八、经验教训 / 踩坑清单

1. **`trigger.dev` 的 bin 名是 `trigger`**，npm script 里用 `trigger deploy`，不是 `trigger.dev deploy`。
2. **npm 8 vs npm 11 的 lockfile 兼容性**：CI 与本地用同一个 npm 主版本，用 `npx npm@11.16.0 ci --dry-run` 提前验证。
3. **`overrides` 与直接依赖精确版本冲突会直接 EOVERRIDE**，别用它压 core 版本。
4. **playwright 扩展的解析依赖版本**：`@trigger.dev/build` 的 playwright 扩展只认 1.49.0 的输出格式，升级 playwright 前先看扩展的 grep 逻辑。
5. **云端 worker 容器没有任何系统浏览器**：任何"本地能跑、云端不能跑"的浏览器代码，先检查 Stagehand/chrome-launcher 的浏览器解析路径。
6. **`Cannot promote a deployment that is older than the current deployment` 是良性竞态**：本地和 CI 同时部署时，较旧的版本号无法覆盖当前版本，重跑一次即可。
7. **区分"构建失败"与"命令退出非零"**：`trigger.dev deploy` 退出码 0 也可能遇到版本 PENDING；退出非零可能只是 promote 竞态。看完整构建日志（CLI 会流式打印）或面板 Deploys 状态为准。

---

## 九、相关提交

```
921bb98 fix(deploy): use playwright 1.49.0 for chromium build extension   ← 最终修复
2536f47 fix(deploy): pin playwright to 1.48.0 for chromium build extension  ← 中间版本（headless-shell grep 失败）
74d1fe1 fix(worker): bundle Chromium into Trigger.dev worker for Stagehand
2a46f10 fix(deploy): use correct trigger CLI bin name in npm script
90c01eb fix(deploy): unify trigger.dev to 4.5.10, drop Sentry from deploy build
```
