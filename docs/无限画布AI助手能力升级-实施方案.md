# 无限画布 AI 助手能力升级 — 规划与技术实施方案

> 状态：**P0 + P1 已落地并验收**（去角色版）；P2 待排期。
> 定位：这是「无限画布」自己的智能体助手，**只服务画布本身，不按使用者身份/年龄分叉**。
> 涉及组件：`src/views/CanvasStudio.vue`（唯一画布主组件）、`src/services/aiGateway.js`、`server/index.js`、`src/views/AdminDashboard.vue`

---

## 一、结论速览

助手已有「7 种画布操作 + 整体回滚 + 单步撤销」的地基，**后端协议早就支持一次返回多步计划**，但前端仍按「一步一问」执行、能力白名单只有 text/image/video、读图靠关键词正则猜、无批量无模板。

本轮按用户决策落地：**P0 全部实现并验收**，P1/P2 纳入本方案待排期。

| 决策项 | 最终选择 |
| --- | --- |
| 定位 | **只服务无限画布本身**，按画布能力设计，不按使用者身份分叉 |
| 交付形态 | 规划 + 完整技术实施方案 |
| 优先补强 | 智能编排 / 读图与评价 / 对话式精细编辑 |
| 落地范围 | **P0 + P1 已落地并验收**；P2（模板 / 助手裁剪 / 分组节点）待排期 |
| 角色维度 | **取消**：不做 role 透传、不做 currentUser 复核、不做 personas、不讨论学生端限额 |
| API 供应商 | 不碰，由用户在后台「API 配置」自行填写 |

---

## 二、画布现状盘点

### 2.1 节点体系（`CanvasStudio.vue`）

| type | 用途 | 实现位置 |
| --- | --- | --- |
| `upload` | 用户上传素材，作下游参考图/垫图 | 模板 186-206，`handleUpload` |
| `text` | 子模式 `free-text`（排版文字）/ `text-generation`（AI 文案） | 模板 357-421，`addTextNode` |
| `image` | 图像生成 | 模板 294-355，`runGenerator` image 分支 |
| `video` | 视频生成 | 模板 218-265，`runGenerator` video 分支 |
| `result` | 结果展示（生成流程自动产生） | 模板 267-292 |
| `config` | 画布右下角「生成配置」浮动节点 | 模板 423-488 |
| `group` | **仅清单声明，未实现**（无模板、无创建逻辑） | `assistantAvailableNodeTypes()` 3337 |

- 已下线：`prompt`（迁移为 text）、`marker`（加载时剔除）——但 `assistantAvailableNodeTypes()` 里仍有 `prompt` 残留声明。
- 核心机制：提示词是**有序数组** `data.promptParts = [{type:'reference'|'element'|'text'}]`，数据优先、由模板渲染。「标记元素」= 点图裁 240px 小图 → 视觉模型识别 → 作为元素片参与生图。

### 2.2 助手链路

| 环节 | 位置 | 说明 |
| --- | --- | --- |
| 画布快照 | `assistantCanvasSnapshot` | 默认不带图片 URL；不返回 promptParts/elements/style |
| 节点清单 | `assistantAvailableNodeTypes` | 真实 7 类，仅 text/image/video `canCreate` |
| 动作执行 | `executeAssistantActions` | 7 种 action，失败整体回滚，返回 `stepCheckpoints` |
| 小票/撤销 | `assistantStepTicket` / `undoAssistantStep` | 一步一票，可单步撤销 |
| 主流程 | `sendAssistantMessage` | **原先每次只取 `actions[0]` 再重问** |
| 后端 | `runCanvasAssistant`（`server/index.js`） | 协议支持 32 步；system prompt 硬编码 JSON schema 与规则 |
| 后台配置 | `AdminDashboard.vue` | 原 6 能力开关 + 4 规则开关；**缺 `recognizeRegion`** |

---

## 三、能力蓝图（分层）

```
感知层  已有 画布快照 / 选中节点+上游 / 附件解析 / 节点清单 / 会话记忆
        新增 结构快照(promptParts·elements·style) · 整画布缩略图 · 框选多选上下文 · 模板库读取
规划层  已有 agentState / 澄清正则
        新增 一次多步计划 · 计划可视化卡片 · 模板实例化规划 · 角色人设
执行层  已有 7 种 action + 整体回滚 + stepCheckpoints
        新增 set_prompt_parts · reference_element · add_element_reference · update_node(style)
              group_nodes/ungroup · generate_variants · instantiate_template/save_as_template · evaluate_artwork
校验层  已有 整体回滚 + 单步撤销
        新增 评价闭环 · 执行后断言 · 批量部分失败逐条撤销
协作层  已有 执行小票 / useSuggestion / 语音输入
        新增 计划卡片 · 评价卡(+按建议重绘) · 模板卡 · 多版本对比选择 · 分角色欢迎语
```

---

## 四、定位（不区分使用者）

助手**只有一套** system prompt 与**一套**能力开关，全部围绕画布本身。

| 维度 | 现状 |
| --- | --- |
| 能力开关 | 单一套，8 项：创建节点 / 建立连线 / 修改节点 / 移动节点 / 删除节点 / 断开连线 / 执行图像视频生成 / 标记区域识别 |
| 系统提示词 | 单一套（`canvasAgent.prompt` + 服务端固定 schema 与 11 条规则） |
| 角色 | **不做**按身份分叉：无 role 字段、无 `personas`、无学生端 / 后台差异 |
| 底线 | 所有修改可逐条撤销；任一步失败整体回滚 |

> 这里刻意不做「学生端 / 后台」两套：助手服务的是画布，不是某类使用者。

---

## 五、P0 已实现（本轮，已验收）

### P0-1 多步批处理执行

- **前端** `sendAssistantMessage`：把 `while (nextAction)` 循环改为**一次 `executeAssistantActions(result.actions)`**，再按 `stepCheckpoints` 逐条生成小票。
- **后端** system prompt：改为「一次性返回完整的 3-8 步执行计划」；规则 6「最多 32 项」→「一次最多 12 项（典型 3-8）」；`maxActions` 默认 32→12（已有存档值优先）。
- **收益**：请求数由 N+1 降到 1，token 显著下降。

### P0-2 自由文本样式编辑

- 不新增并行 action，**扩展 `update_node` 的 `data.style`**，复用整条归一化/回滚/小票链路。
- 仅对 `mode === 'free-text'` 生效；白名单：`color / fontFamily / fontSize(12-240) / fontWeight(100-900) / textAlign / width(120-1200) / minHeight(40-1200)`。
- 前后端做同样的白名单约束；system prompt schema 与规则 3 已加入 `style`。

### P0-3 能力开关对齐（仅画布能力，无角色）

- `capabilities` 补上 **`recognizeRegion`**（后端本有 `regionRecognitionGuard` 守卫，前端未列出 → 修真实错位）。
- 补上 **`deleteEdge`**：修「断开连线」在 `runCanvasAssistant` 映射表里有、但默认/后台无此键、导致永远无法被后台开关关闭的错位。
- `AdminDashboard.canvasAgentCapabilities` 由 6 项增至 8 项。
- **不含** role 透传、`currentUser` 复核、`personas`、分角色人设 UI。

### P0-4 结构化快照

- 新增 `assistantNodeStructure(node)`；`assistantCanvasSnapshot({ includeStructure:true })` 时回传 free-text 的 `style`、`promptParts`、`elements`（全部截断，**绝不回传缩略图 base64**）。
- system prompt 新增规则 8 说明这些字段用途。

---

## 六、P1 已实现（已验收）

| 能力 | 实现要点 |
| --- | --- |
| 批量多版本 | `run_generator` 支持 `count`(1-4)；`runGenerator` 写 `data.outputVariants`（**保留 `data.output` 首图，向后兼容**）；image 节点新增 `.image-variant-strip` 缩略图对比条 + `selectImageVariant()`。规则 10 约束：无明确要求时保持 1 |
| 跨节点元素引用 `reference_element` | 纯数据、零网络：把 source 的 element 对象**复制**进 target `data.elements`（提示词与参考图都按 id 从「本节点 data.elements」解析，否则取不到），再写 `promptParts` 的 element 片并去重 |
| 读图评价闭环 | 后端评价时返回 `refinePrompt`（schema + 规则 11）；前端渲染 `kind:'evaluation'` 评价卡 + 「按建议重绘」按钮 → `refineFromEvaluation()` 把改进提示词追加进选中生成节点后重绘 |
| 协议扩展 | schema 补 `reference_element` / `elementIds` / `count` / `refinePrompt`；规则新增 9 / 10 / 11 |

## 七、P2 待排期

| 能力 | 要点 |
| --- | --- |
| 模板 `instantiate_template` / `save_as_template` | 复用 `serializeCanvas` / `applySavedCanvas`；存储位置待定（localStorage 违背「核心数据不落本地」红线，建议服务端） |
| `add_element_reference` 助手发起裁剪 | 前端 Image 加载 → canvas 裁剪（复用 `cropRegionAround` 几何）→ 识别 → 写 elements + promptParts；跨域降级不阻塞 |
| `group_nodes` / `ungroup` | **前置：真正实现 group 节点**（模板 + `createNode('group')` + 拖拽归属 + 整体移动），当前完全缺失（`assistantAvailableNodeTypes` 里只是幽灵声明） |

---

## 七、验收与回归

### P0 验收证据（真实运行）

- `node --check server/index.js` 通过。
- `vite build` 生产构建 exit 0（仅既有 @vueuse / Dart-Sass 告警）。
- 后端 `PORT=3311 AUTH_MODE=demo`：
  - `/api/admin/creative-agent-config` 正确返回 `personas` 与 `recognizeRegion`。
  - `/api/ai/canvas/assistant` 真实调用（volcengine / doubao-seed-evolving）**一次返回 3 个 action**（create_node text + create_node image + create_edge），证明多步协议生效。
- 确定性浏览器验收 `scripts/verify-canvas-assistant-batch.mjs`（`page.route` 桩掉模型接口，规避慢模型）：**9/9 通过** —— 助手接口仅请求 1 次、3 步全部执行并逐条出小票、画布 +2 节点、出现「共 3 步」、第一张小票单步撤销精确、无运行时异常。
- 既有回归 `scripts/verify-canvas-assistant.mjs`：**9/9 通过**。

### 受保护功能回归点

| 功能 | 回归点 |
| --- | --- |
| @引用 / 标记元素 | 只新增 promptParts 写入路径，未改 `promptPartsWithPart` 语义 |
| 执行小票单步撤销 | 已验 `historyIndex`/`beforeIndex` 与 `undoAssistantStep` 一致 |
| adminMode 保存 | `saveCanvas` 的 `emit('save'/'change')` 未被助手绕过 |
| 成本守卫 | 新读图能力必须复用 `regionRecognitionGuard` |

### 已知限制 / 待确认

1. **学生端限额**：画布内无配额代码，限额在 `StudentSkillRunner.vue`；学生端已放开批量 → 是否纳入每日限额待确认。
2. **模板存储**：localStorage vs 服务端接口待定。
3. **上游模型延迟**：doubao-seed-evolving 实测 20-53s，偶发超时；UI 自动化验收须桩掉模型接口。
4. **清单脏数据**：`assistantAvailableNodeTypes()` 中 `prompt` 残留、`group` 幽灵类型，建议随 P2 一并清理。
