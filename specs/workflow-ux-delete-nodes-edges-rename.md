# Feature: 工作流 UX 改进 — 删除节点、删除连线、自定义命名

## 日期

2026-07-29

## 背景

当前工作流编辑器存在三个 UX 痛点：

1. **无法通过 UI 删除 Toolbar（节点）**：虽然 React Flow 内置支持选中节点后按 Delete 键删除，但没有任何可视化的删除按钮，用户难以发现此操作。
2. **无法删除节点间的连线**：连线（Edge）宽度极窄，难以选中点击，按 Delete 键的操作对连线几乎不可用。用户连错线后无法修改。
3. **无法自定义工作流名称**：新建工作流时自动生成名称（如 `happy-cat`），用户无法在创建时命名，也无法在创建后修改。

## 解决方案

### 功能 1：删除节点 UI

在右侧面板的 Editor 标签页（Inspector）中，当选中一个节点时，在其标题栏右侧显示一个 `Trash2` 删除按钮。点击后调用 React Flow 的 `deleteElements` API 删除该节点及其所有关联连线。

**涉及文件**：
- `features/workflows/components/right-sidebar.tsx`：`Section` 组件新增 `actions` prop；`Inspector` 组件新增删除按钮

### 功能 2：删除连线 UI

创建自定义 Edge 组件 `DeletableEdge`，使用 React Flow 的 `EdgeLabelRenderer` 在每条连线的中点渲染一个 "×" 删除按钮。按钮在 hover 或选中连线时显示，点击后删除该连线。

为提高 hover 可探测性，在可见连线下方叠加一条透明的宽路径（`strokeWidth={20}`）作为 hover 热区。

**涉及文件**：
- `features/workflows/components/deletable-edge.tsx`（新建）：自定义 Edge 组件
- `features/workflows/components/canvas.tsx`：注册 `DeletableEdge` 为默认 edge 类型

### 功能 3：自定义工作流名称

**创建时命名**：新建 `NewWorkflowDialog` 组件，以 Dialog 弹框替代直接创建。对话框内预填一个自动生成的名称（`generateSlug()`），用户可编辑后确认创建。支持 Enter 快捷键提交。

**运行时重命名**：在右侧面板顶部显示当前工作流名称，旁边有一个 `Pencil` 编辑图标。点击后弹出重命名 Dialog，输入新名称后保存。需要新增后端 `renameWorkflowAction` 和 `renameWorkflow` 数据层函数。

**涉及文件**：

| 文件 | 变更 |
|------|------|
| `features/workflows/components/new-workflow-dialog.tsx` | **新建** — 创建命名 Dialog |
| `features/workflows/components/new-workflow-button.tsx` | 替换直接创建为打开 Dialog |
| `features/workflows/components/workflow-nav.tsx` | 替换直接创建为打开 Dialog；移除未使用的 `onCreateWorkflow` prop |
| `features/workflows/components/right-sidebar.tsx` | 顶部栏显示工作流名称 + 编辑按钮 + 重命名 Dialog |
| `features/workflows/actions.ts` | 新增 `renameWorkflowAction` server action |
| `features/workflows/data.ts` | 新增 `renameWorkflow()` 数据库更新函数 |
| `features/workflows/components/workflow-shell.tsx` | 新增 `workflowName` prop 透传 |
| `app/(dashboard)/workflows/[id]/page.tsx` | 传递 `workflow.name` 给 `WorkflowShell` |
| `components/app-sidebar.tsx` | 移除未使用的 `createWorkflowAction` 导入和 prop |

## 架构设计

```
创建工作流:
  NewWorkflowButton / WorkflowNav "+" 按钮
    → 打开 NewWorkflowDialog（预填 generateSlug()）
      → 用户编辑名称 → 确认
        → createWorkflowAction(name) → redirect

重命名工作流:
  RightSidebar 顶部栏 → 点击 Pencil 图标
    → 打开 Rename Dialog（预填当前名称）
      → 用户编辑 → 确认
        → renameWorkflowAction({ id, name })
          → DB UPDATE → revalidatePath → UI 更新

删除节点:
  选中节点 → RightSidebar Editor 标签页
    → 点击 Trash2 按钮
      → deleteElements({ nodes: [{ id }] })
        → Liveblocks 同步 → 所有协作者实时更新

删除连线:
  Hover 连线 → 中点出现 "×" 按钮
    → 点击按钮
      → deleteElements({ edges: [{ id }] })
        → Liveblocks 同步 → 所有协作者实时更新
```

## 验证

1. **删除节点**：打开任一工作流 → 添加节点 → 选中节点 → Editor 标签页显示删除按钮 → 点击删除 → 节点及连线从画布消失
2. **删除连线**：连接两个节点 → 鼠标悬停在连线上 → 中点的 "×" 按钮出现 → 点击 → 连线消失
3. **自定义名称创建**：点击 "New workflow" → Dialog 弹出，预填名称 → 编辑为自定义名称 → 点击 Create → 侧边栏显示新名称
4. **重命名工作流**：打开工作流 → 右侧面板顶部显示名称 → 点击 Pencil 图标 → 修改名称 → Save → 名称更新
5. **键盘兼容**：Delete 键仍然可以删除选中的节点和连线（React Flow 原有行为保留）
