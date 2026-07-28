# Fix: Extract 节点 DeepSeek 结构化对象返回修复

## 日期

2026-07-28

## 问题描述

在 `strange-zebra` 工作流中，Agent 节点成功导航到下厨房网站并进入菜谱详情页，但后续的 Extract 节点（extract1）提取失败，导致 Send Email 节点收到的内容为空，邮件显示：

> (No content was extracted from the page — the extraction step returned empty.)

## 根因分析

**文件**：`features/workflows/nodes/extract.ts`

Extract 节点的 Zod schema 将 `extraction` 字段限定为**字符串类型**：

```typescript
// 修复前
const schema = z.object({
  extraction: z
    .string()
    .nullable()
    .describe("The extracted content as a string. Return null if ..."),
})
```

但 DeepSeek 模型 (`deepseek-v4-flash`) 理解到「提取菜谱」应返回结构化数据，自然地输出了 JSON 对象而非字符串：

```json
{
  "extraction": {
    "ingredients": ["鸡蛋 4个", "西红柿 3个", "油 适量", ...],
    "steps": ["第1步...", "第2步...", ...],
    "tips": "认真跟足步骤做！你也能做出超好吃的番茄炒蛋！"
  }
}
```

Zod 校验失败：

```
ERROR: No object generated: response did not match schema.
cause: Invalid input: expected string, received object
```

两次尝试（原始请求 + boosted prompt 重试）均因同一原因失败，catch 块返回 `{ extraction: null }`。Email 节点中 `{{ extract1.extraction }}` 引用到 `null`，经 interpolate 渲染为空字符串，触发 send-email 的空内容保护逻辑。

### 调用链路

```
Agent (成功) → Extract (失败) → Send Email (收到空内容)
                    ↓
            LLM 返回结构化对象
                    ↓
            Zod 校验: expected string, received object
                    ↓
            两次重试均失败
                    ↓
            return { extraction: null }
```

## 解决方案

将 schema 从单一 `z.string()` 改为 `z.union`，同时接受多种类型：

```typescript
// 修复后
const schema = z.object({
  extraction: z
    .union([z.string(), z.record(z.string(), z.any()), z.array(z.any())])
    .nullable()
    .describe(
      "The extracted content — can be a plain string, a structured object, " +
      "or an array. Return null only if nothing matching the instruction is " +
      "found on the page.",
    ),
})
```

| 类型 | 用途 |
|------|------|
| `z.string()` | 纯文本提取 |
| `z.record(z.string(), z.any())` | 结构化对象（如 `{ingredients, steps, tips}`） |
| `z.array(z.any())` | 列表型提取 |
| `null` | 页面无匹配内容 |

### 下游兼容性

`extract.ts` 第 57-79 行的结果处理逻辑已完整覆盖所有类型：

- `extraction === "null"` 或 `extraction === ""` → 归一化为 `null`
- `typeof extraction === "string"` → 尝试 `JSON.parse`，成功则返回解析后的对象，失败则返回原字符串
- `extraction` 已是对象 → 直接返回

无需额外修改。

## 修改文件

| 文件 | 变更内容 |
|------|---------|
| `features/workflows/nodes/extract.ts` | Schema 从 `z.string().nullable()` 改为 `z.union([z.string(), z.record(...), z.array(...)]).nullable()`；`result` 类型标注从 `{ extraction: string \| null }` 改为 `{ extraction: unknown }` |

## 验证

1. 启动前端：`npm run dev`
2. 启动后端：`npx trigger.dev dev`
3. 运行 `strange-zebra` 工作流
4. 确认 Extract 节点返回结构化数据，不再报 Zod 校验错误
5. 确认 Send Email 节点收到完整的菜谱内容
