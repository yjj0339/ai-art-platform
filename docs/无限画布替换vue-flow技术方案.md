# 无限画布替换为 vue-flow-v1.48.2 技术方案（待审阅）

> 状态：**方案稿，未动代码**。请审阅确认后再执行。
> 日期：2026-09-07

---

## 一、先说清三个关键事实（避免误解）

### 事实 1：现有画布**底层已经是 vue-flow**
`src/views/CanvasStudio.vue` 当前：
- 已安装依赖 `@vue-flow/core@^1.48.2`（node_modules/@vue-flow/core 存在）
- 第 799-801 行已 `import { VueFlow, Handle, Position, addEdge, useVueFlow } from '@vue-flow/core'`
- 模板里 `<VueFlow id="ai-creation-workflow">` + 自定义节点插槽 + 自研大量业务逻辑

> ⚠️ 所以"替换成 vue-flow"不是"从一个没用 vue-flow 的产品换到 vue-flow"，而是：**当前产品是在 vue-flow 骨架上自研了 4768 行巨型单文件业务逻辑**（AI 节点、上传、保存、权限、参考图、chip 引用等）。真正的问题是**代码组织失控**，不是"没用对库"。

### 事实 2：vue-flow-v1.48.2 仓库是**组件库源码 + 示例**，不是现成 AI 产品
- 目录：`D:\ruanjian\开源项目\vue-flow-v1.48.2` = vue-flow 官方 monorepo（core 1.48.2 + background/controls/minimap 等附加包 + 30 多个 examples 示例页）
- examples/vite 里是 Basic / Math / SaveRestore / Layouting / DragNDrop 等**功能演示**，**没有任何"无限画布 + AI 生成"的成品页面**
- 仓库未装 node_modules，是源码形态

### 事实 3：后端对接目标 = 本机 project-005 后端（端口 3000）
你已确认"对接我现在 AI 绘画网站的后台"指的就是**这套本地后端**。它已有完整 AI 接口：
`/api/ai/image/generate`、`/api/ai/video/generate`、`/api/ai/video/tasks/:id`、`/api/ai/model3d/generate`、`/api/ai/prompt/optimize`、`/api/ai/canvas/assistant`、`/api/ai/health`、AI 技能、模型配置、账号权限等（server/index.js）。

---

## 二、你要的"无限画布入口"——我理解的两种可能

请确认你要的是哪一种：

### 方案 A：以 vue-flow examples 为底子，重建一个干净画布（推荐）
**做法**：不动后端、不删现有画布文件，而是**新增一个页面**（如 `CanvasFlow.vue`），只引用 `@vue-flow/core` + 参考官方 examples 里最接近的写法（Math 的节点-运行模式、SaveRestore 的存取、Layouting 的自动布局），把"无限画布"从 4768 行泥潭里剥出来，重写为**按需加载的少量组件**：
- 节点类型：文字 / 图片生成 / 视频生成 / 3D / 结果
- 自定义节点组件（参考 `examples/vite/src/Math/*Node.vue` 的 slot 写法）
- 连线执行：上游结果作为下游参考（对接后端 `/api/ai/*`）
- 保存恢复：对接现有 `/api/me/documents`（type=canvas）
- 入口：`/student/canvas` 路由指向新组件（老组件保留备份可回退）

**优点**：干净、可控、真正解决"巨型文件难维护"；复用现成后端和依赖
**缺点**：需重写业务节点（不是纯复制），工作量中等；视觉需重做

### 方案 B：直接把 vue-flow 官方示例页（examples/vite）整体作为入口
**做法**：把 vue-flow examples/vite 这个演示站跑起来/并入站点作为新画布页。

**问题**：examples 只是演示，**不含**你的 AI 业务、账号、作品库。即使接上，也只得到一个"能拖节点连线"的空壳，仍需把所有 AI 业务逻辑再写一遍，且要适配官方示例与你的站点样式——**并不比 A 省事，反而更难维护**。不建议。

> 若你说的"vue-flow-v1.48.2 的无限画布"指的是仓库里某个**具体示例页/文件**，请告诉我路径（例如 `examples/vite/src/Layouting` 或某个 gif 对应的页面），我按那个为准调整方案。

---

## 三、推荐方案 A 的详细设计

### 3.1 目标结构（新增，不删旧）
```
src/views/
  CanvasFlow/                  ← 新画布（vue-flow 重写版）
    index.vue                  ← 页面壳：工具栏/属性面板/保存
    nodes/                     ← 自定义节点组件
      TextNode.vue / ImageNode.vue / VideoNode.vue / ResultNode.vue
    edges/                     ← 自定义连线（可选）
    canvasStore.js             ← 节点/边状态（Pinia，便于保存恢复）
  CanvasStudio.vue             ← 保留备份（路由暂不指向，可随时回退）
```
路由：`/student/canvas` 从 `CanvasStudio.vue` 改指向 `CanvasFlow/index.vue`
（`StudentWorkbench.vue` 的入口按钮无需改，自动跟随）

### 3.2 依赖
- 现有 `@vue-flow/core@^1.48.2` 已满足；如需小地图/控制按钮，新增 `@vue-flow/background`、`@vue-flow/controls`、`@vue-flow/minimap`（可从开源仓库 packages/ 对应版本对齐安装，均与 core 1.48.2 同源）

### 3.3 功能映射（旧画布 → 新画布）
| 旧画布能力 | 新画布承接方式 | 工作量 |
|---|---|---|
| 创建节点（文字/图片/视频/3D） | 自定义节点组件 + 创建菜单 | 中 |
| 节点连线、上下游引用 | vue-flow 原生 Handle/Edges + 自绘 chip 引用（保留参考条） | 中 |
| 图片生成 | 调后端 `/api/ai/image/generate` | 低 |
| 视频生成/进度 | 调 `/api/ai/video/generate` + `/api/ai/video/tasks/:id` 轮询 | 低 |
| 3D 生成 | 调 `/api/ai/model3d/generate` + `/tasks/:id` | 低 |
| 提示词优化 / 画布助手 | `/api/ai/prompt/optimize`、`/api/ai/canvas/assistant` | 低 |
| 画布保存/恢复 | 复用现有 `/api/me/documents`(type=canvas) 或 projectStore | 中 |
| 账号权限进入 | 路由 meta + 现有权限 store | 低 |
| 素材上传/参考图 | 复用现有 upload 接口 + fileInput | 中 |
| 旧数据兼容（老画布 JSON） | 需写一层 migration：旧节点 data 结构 → 新节点 data | 中（关键） |

### 3.4 数据兼容策略
旧画布 localStorage key `ai-workflow-canvas-stage1-v2` 与服务端 documents 中的旧结构，需在加载时**适配**到新组件结构（或提供"导入旧画布"按钮）。**这是必须提前确认的点**：旧画布数据要迁移保留，还是全新开始（旧数据不再读取）？

### 3.5 验收与回归
- 新画布：创建各类型节点、连线、调真实 AI（至少图片 1 次）、保存后刷新恢复、权限控制
- 旧功能保护：`CanvasStudio.vue` 保留备份，路由切走后旧文件不参与构建入口；如发现新画布有致命问题可一键回退
- 更新 `docs/功能基线与回归清单.md` 中"AI 无限画布"条目状态

---

## 四、需要你拍板的决策点

| # | 决策 | 选项 |
|---|---|---|
| D1 | 采用哪个方案 | **A（推荐，新页面重写）** / B（官方示例当入口）/ 其他 |
| D2 | 旧画布数据（用户已保存的节点/作品） | ① 写迁移兼容保留 ② 不迁移，全新开始（旧数据作废） |
| D3 | 新画布视觉风格 | ① 仿照现有 AI 创作画布风格重做 ② 尽量贴近 vue-flow 官方默认样式 |
| D4 | 旧的 4768 行 CanvasStudio.vue 处理 | ① 保留文件备份、路由切换（推荐）② 直接删除 |
| D5 | 是否先做最小可跑骨架（能建节点/连线/调一次 AI 出图）给你看效果再扩展 | ① 是（推荐，先骨架后补全）② 一次性全量 |

---

## 五、风险与说明
1. 本方案是**较大改造**：按 AGENTS.md 需先确认，符合你"先出方案再动手"的选择。
2. vue-flow 1.48.2 与项目现有 core 同版本，无升级风险。
3. 若 D2 选"不迁移"，老用户已保存画布将不可见（本机 demo 阶段影响小，但需你确认）。
4. 重写范围只覆盖"无限画布页"，不触碰 PaintStudio / 视频 / 3D 等既有页面。
