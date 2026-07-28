# Fix: 浏览器连接重构 — 从 Browserless CDP 迁移到本地 Chromium

## 日期

2026-07-28

## 变更概要

将浏览器运行方式从 **Browserless 云端 CDP 连接** 改为 **本地 Chromium 启动**，并修复了 agent / extract / openUrl / act 等多个节点的稳定性与 API 调用问题。

## 修改文件

| 文件 | 变更内容 |
|------|---------|
| `features/workflows/tasks/run-workflow.ts` | 删除 `cdpUrl` 及 Browserless 相关代码，改用 Stagehand 本地 Chromium 启动 |
| `features/workflows/nodes/open-url.ts` | `waitUntil: "load"` → `"domcontentloaded"` + `"commit"` 降级 |
| `features/workflows/nodes/agent.ts` | `execute(instruction)` → `execute({ instruction, maxSteps: 30 })`，新增用户可配的 `maxSteps` 字段 |
| `features/workflows/nodes/act.ts` | `waitForLoadState("load")` → `"domcontentloaded"`，超时不崩溃 |
| `features/workflows/nodes/extract.ts` | 简化双重重试逻辑，失败时优雅降级返回 `null` |
| `features/workflows/nodes/node-registry.ts` | agent 节点新增 `maxSteps` 字段 |
| `features/workflows/nodes/node-executors.ts` | agent executor 传递 `maxSteps` 参数 |

## 遇到的难题与解决方案

### 难题 1：CDP WebSocket RSV1 错误（核心问题）

**现象**：运行 workflow 时，浏览器在约 95 秒后崩溃，Trigger.dev 日志反复出现：

```
ERROR: initiating shutdown → CDP transport closed:
socket-error Invalid WebSocket frame: RSV1 must be clear
```

所有依赖浏览器的节点（openUrl、act、extract、agent）全部失败。

**分析过程**：

1. **第一次尝试** — `localBrowserLaunchOptions.args`：将 `--disable-features=WebSocketPermessageDeflate` 放在 `localBrowserLaunchOptions.args` 中。**无效**。原因是当设置了 `cdpUrl` 时，Stagehand 使用 Playwright 的 `connectOverCDP` 连接到已运行的浏览器，此时 Chrome **不会**被本地启动，`args` 数组被完全忽略。

2. **第二次尝试** — Browserless URL query 参数：将 launch 参数编码后拼接在 CDP WebSocket URL 中：`wss://chrome.browserless.io?token=xxx&launch={"args":[...]}`。**无效**。Browserless 的原始 CDP WebSocket endpoint（`/`路径）不会解析 `launch` query 参数——该参数仅在 HTTP API（`/chromium/playwright`）中有效。

3. **最终方案** — 放弃 Browserless，使用本地 Chromium：
   - 删除 `cdpUrl` 配置
   - 安装 `npx playwright install chromium`
   - Stagehand 通过 Playwright 直接启动本地 Chromium（`env: "LOCAL"` 不含 `cdpUrl`）
   - 通过 `localBrowserLaunchOptions.args` 传入 `--disable-features=WebSocketPermessageDeflate` 等 flag

**为什么有效**：本地启动时 Stagehand 会调用 Playwright 的 `chromium.launch()`，`args` 会被正确传递给 Chrome 进程。不再经过 CDP WebSocket 连接到远程服务，消除了压缩协商问题。

### 难题 2：openUrl 长期卡死

**现象**：访问 Google、百度等页面时，openUrl 节点长时间无响应，整个 workflow 挂起。

**原因**：原代码使用 `waitUntil: "load"`，这会等待页面**所有资源**（图片、字体、追踪脚本等）加载完毕。Google 首页加载了数百个子资源，导致卡死。

**解决**：将 `waitUntil` 改为 `"domcontentloaded"`（HTML 解析完毕即触发），并增加 `"commit"` 降级（任意导航即触发）。Stagehand 的 AI 方法只需要 DOM 就绪，不需要等图片加载。

### 难题 3：agent 节点无法正常工作

**现象**：agent 节点执行时行为异常或无限循环。

**原因**：原代码 `stagehand.agent().execute(instruction)` 传入了裸字符串。虽然 TypeScript 类型允许（`execute` 接受 `string | AgentExecuteOptions`），但缺少 `maxSteps` 参数，agent 首次 ModelMessage 消息数可能过多导致 LLM 无法正确解析。

**解决**：
- 改为 `execute({ instruction, maxSteps: 30 })`
- 在 `node-registry.ts` 中为用户暴露 `maxSteps` 配置字段
- 在 `node-executors.ts` 中传递该字段

### 难题 4：extract 节点 Zod 校验崩溃

**现象**：LLM 返回 `{"extraction": null}` 时 Zod 抛出 `Expected string, received null`，整个 workflow 崩溃。

**原因**：Stagehand 的默认 extract schema 使用 `z.string()` 不接受 null。

**解决**：构建 schema 时使用 `z.string().nullable()`，并简化重试逻辑——首次失败后重试一次 boosted prompt，再次失败则返回 `{ extraction: null }` 而非崩溃。

## 验证

1. 安装 Chromium：`npx playwright install chromium`
2. 启动前端：`npm run dev`
3. 启动后端：`npx trigger.dev@4.5.7 dev`
4. 在 `http://localhost:3000` 创建 workflow（open-url → extract / act / agent）
5. 确认不再出现 RSV1 错误，各节点功能正常

## 架构变化

```
Before:
  trigger.dev task → Stagehand → Playwright connectOverCDP → Browserless cloud Chrome
                                ↑ args 被忽略，RSV1 错误

After:
  trigger.dev task → Stagehand → Playwright launch → 本地 Chromium
                                ↑ args 正确传递
```
