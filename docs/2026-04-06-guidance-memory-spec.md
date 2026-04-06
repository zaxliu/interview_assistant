# Position-Level Guidance Memory Spec

## 1. Goal

把当前“反馈事件直接做频次统计并拼 guidance 文本”的方案，升级为“岗位级 memory”方案：

- 原始反馈事件持续沉淀
- 在需要时由 LLM 将事件提炼为结构化 memory items
- 再把 memory items 渲染成问题生成 / 面评生成所用 guidance
- 保持单用户、本地存储、低成本、可见刷新过程

目标效果：

- guidance 更像稳定偏好记忆，而不是统计列表
- memory 更新不再过于频繁
- 用户可以看到 guidance/memory 刷新的存在与 token 消耗
- 用户可以在岗位页手动触发 guidance 更新

## 2. Non-Goals

本期不做：

- 多用户共享 memory
- 跨岗位共享 memory
- 服务端持久化 memory
- memory 人工编辑器
- memory 版本 diff 浏览器
- 自动 A/B 实验框架

## 3. Current Problems

当前实现的主要问题：

- guidance 合成是本地统计拼接，不是 LLM 总结
- `question_edited` 信号过粗，只分“缩短题干 / 扩展题干”
- 每次 feedback event 都同步刷新 guidance，频率过高
- guidance 文本缺少去重、冲突消解、稳定偏好抽取
- 用户只能看到最终 guidance，看不到“更新 guidance”这个动作及成本

## 4. Core Design

### 4.1 Three-Layer Model

系统分三层：

1. `feedback events`
- 原始反馈事件
- 来源于题目采纳、删改、面评改写等用户行为

2. `memory items`
- 由 LLM 从近期 feedback evidence 中提炼的结构化岗位记忆
- 表达“稳定的生成偏好/约束”
- 是内部存储主形态

3. `guidance prompt`
- 从 memory items 渲染出的任务型自然语言指引
- 分为：
  - `questionGuidancePrompt`
  - `summaryGuidancePrompt`
- 是最终注入生成 prompt 的内容

关系：

`feedback events -> evidence packets -> memory items -> guidance prompt -> final generation prompt`

### 4.2 Scope Split

memory 按任务分两类 scope：

- `question_generation`
- `summary_generation`

不同 scope 分别维护 dirty 状态、刷新时间、usage 和 guidance。

## 5. Data Model

### 5.1 New Types

在 `src/types/index.ts` 新增：

```ts
export type MemoryRefreshScope = 'question_generation' | 'summary_generation';

export interface GenerationMemoryItem {
  id: string;
  scope: MemoryRefreshScope;
  kind: 'prefer' | 'avoid' | 'preserve' | 'prioritize';
  instruction: string;
  rationale: string;
  evidenceCount: number;
  confidence: number;
  lastSeenAt: string;
}

export interface GenerationMemory {
  questionMemoryItems: GenerationMemoryItem[];
  summaryMemoryItems: GenerationMemoryItem[];
  questionGuidancePrompt: string;
  summaryGuidancePrompt: string;
  updatedAt: string;
  sampleSize: number;
  version: number;
}

export interface GenerationMemoryState {
  dirtyScopes: MemoryRefreshScope[];
  lastQuestionRefreshAt?: string;
  lastSummaryRefreshAt?: string;
  pendingQuestionEventCount: number;
  pendingSummaryEventCount: number;
  pendingQuestionCandidateCount: number;
  pendingSummaryCandidateCount: number;
  lastQuestionRefreshUsage?: AIUsage;
  lastSummaryRefreshUsage?: AIUsage;
  lastManualRefreshAt?: string;
}
```

### 5.2 Position Changes

`Position` 新增：

```ts
generationMemory?: GenerationMemory;
generationMemoryState?: GenerationMemoryState;
```

现有 `generationGuidance` 处理方式：

- 本期保留兼容字段一段时间
- 但新的消费逻辑应优先使用 `generationMemory.questionGuidancePrompt` / `summaryGuidancePrompt`
- `generationGuidance` 可作为兼容视图，或后续迁移后删除

## 6. Event Capture Rules

### 6.1 Keep Existing Feedback Events

保留现有 feedback 事件类型：

- `question_asked`
- `question_deleted`
- `question_edited`
- `summary_rewritten`

### 6.2 Dirty Scope Mapping

事件写入后只标记 dirty，不立即调 LLM：

- `question_asked` -> dirty `question_generation`
- `question_deleted` -> dirty `question_generation`
- `question_edited` -> dirty `question_generation`
- `summary_rewritten` -> dirty `summary_generation`

### 6.3 Event Persistence

`recordFeedbackEvent(positionId, event)` 必须：

1. 写入 `feedbackEvents`
2. 更新 `generationMemoryState`
3. 不做 LLM 刷新
4. 不阻断用户当前操作

## 7. Evidence Preparation

### 7.1 Why Evidence Layer Exists

LLM 不直接消费原始 event，而是先消费标准化 evidence packet，避免：

- 原始字段过脏
- 冗余事件过多
- 缺少题目/面评上下文
- prompt 结构不稳定

### 7.2 Evidence Packet Shape

新增内部类型：

```ts
export interface MemoryEvidencePacket {
  scope: MemoryRefreshScope;
  eventType: string;
  candidateId: string;
  createdAt: string;
  summary: string;
  payload: Record<string, unknown>;
}
```

### 7.3 Evidence Mapping

问题类 evidence：

- `question_asked`
  - 题目文本
  - source
  - evaluationDimension
  - 是否 AI 生成
  - 是否来自 meeting notes 新增
  - 是否已有历史面评覆盖信息

- `question_edited`
  - 原题文本
  - 编辑后文本
  - source
  - evaluationDimension
  - 推断 edit intent
    - 如：更具体 / 更贴近 JD / 增加追问 / 弱化攻击性 / 去重
  - 如果暂时无法稳定识别，先保留现有粗粒度模式并预留扩展

- `question_deleted`
  - 被删题文本
  - source
  - evaluationDimension
  - 是否与已有问题高度相似

面评类 evidence：

- `summary_rewritten`
  - AI draft
  - final summary
  - rewriteIntensity
  - preferences[]
  - 是否改动了结论 / 分数 / 总评结构

## 8. Memory Refresh Strategy

### 8.1 Primary Path: Lazy Refresh Before Generation

在真正生成前按 scope 检查 memory 是否需要刷新：

- 问题生成前：
  - `ensureGenerationMemoryFresh(positionId, 'question_generation')`
- 面评生成前：
  - `ensureGenerationMemoryFresh(positionId, 'summary_generation')`

### 8.2 Refresh Conditions

如果 scope 是 dirty，满足以下任一条件则刷新：

- pending events >= 5
- pending candidates >= 2
- 距上次刷新超过 7 天
- 用户当前正在触发生成，并且 memory 仍然 dirty

### 8.3 Cooldown

同一岗位同一 scope：

- 30 分钟内避免重复后台刷新
- 但如果用户当前明确点击生成，可以允许本次懒刷新继续执行

### 8.4 Manual Refresh Path

在岗位详情页加显式按钮：

- 按钮文案建议：`更新 AI 指引`
- 点击后：
  - 可同时刷新问题 guidance 和面评 guidance
  - 不受事件阈值限制
  - 只要当前没有刷新中的同 scope 任务即可执行
- 这条路径是额外入口，不替代懒刷新主路径

## 9. LLM Memory Synthesis

### 9.1 New API

在 `src/api/ai.ts` 新增：

```ts
synthesizePositionMemory(
  config,
  scope,
  existingItems,
  evidencePackets
): Promise<AIResultWithUsage<...>>
```

### 9.2 Input

输入包含：

- 当前 scope
- 旧 memory items
- 最近 20 个候选人的 evidence packets
- 约束规则

### 9.3 Output

输出必须是结构化 JSON：

```json
{
  "memory_items": [
    {
      "kind": "prefer",
      "instruction": "问题要更具体并贴近候选人真实经历",
      "rationale": "用户多次采纳具体问题，宽泛问题更易被改写或删除",
      "evidence_count": 6,
      "confidence": 0.84
    }
  ],
  "guidance_prompt": "生成问题时优先使用具体、可验证、贴近简历经历的提问方式，避免过于宽泛的开放式问题。"
}
```

### 9.4 LLM Rules

prompt 必须明确要求模型：

- 这是“维护岗位记忆”，不是简单总结
- 只保留稳定、可操作、可复用的偏好
- 合并重复项
- 忽略一次性、低信号、偶发编辑
- 如果新证据和旧记忆冲突，以较新且证据更多的一方为准
- 输出少量高质量 item，不要输出泛泛套话
- guidance_prompt 必须短、明确、适合直接注入生成 prompt

## 10. Local Validation and Merge

LLM 输出不能直接信任，必须本地校验：

- schema 校验
- `kind` / `scope` 枚举校验
- `instruction` / `rationale` 非空校验
- `confidence` 限制在 `0-1`
- `evidenceCount` 最小为 `1`
- item 数量上限
  - question: 最多 6 条
  - summary: 最多 6 条
- guidance_prompt 长度限制
  - 默认约 600-1200 中文字符内
- 失败时：
  - 丢弃本次刷新结果
  - 保留旧 memory
  - dirty 状态不清除

## 11. UI Spec

### 11.1 Position Detail Page

文件：`src/pages/PositionDetailPage.tsx`

新增/调整：

- 保留当前 guidance 展示区
- 展示：
  - question guidance
  - summary guidance
  - `sampleSize`
  - `updatedAt`
  - 最近一次问题 guidance 刷新 token usage
  - 最近一次面评 guidance 刷新 token usage
  - 当前是否 dirty
- 新增按钮：
  - `更新 AI 指引`
- 点击按钮后的状态：
  - loading
  - 成功提示
  - 失败提示
- 本次手动刷新若触发 LLM，应显示 usage

### 11.2 Interview Panel

文件：`src/components/interview/InterviewPanel.tsx`

问题生成前，如果触发懒刷新：

- 显示步骤：
  - `正在更新岗位问题记忆...`
- 刷新完成后：
  - 显示 `问题记忆更新` usage
- 然后再执行问题生成
- 问题生成 usage 继续单独显示

### 11.3 Summary Editor

文件：`src/components/summary/SummaryEditor.tsx`

面评生成前，如果触发懒刷新：

- 显示步骤：
  - `正在更新岗位面评记忆...`
- 刷新完成后：
  - 显示 `面评记忆更新` usage
- 然后再执行面评生成
- 面评生成 usage 继续单独显示

## 12. Analytics / Usage

新增埋点建议：

- `memory_refresh_succeeded`
- `memory_refresh_failed`
- `memory_applied_to_question_generation`
- `memory_applied_to_summary_generation`
- `manual_memory_refresh_triggered`

埋点字段建议：

- `positionId`
- `scope`
- `manual: boolean`
- `sampleSize`
- `memoryItemCount`
- `guidanceLength`
- `usage.input`
- `usage.cached`
- `usage.output`

## 13. Failure Handling

所有 memory 刷新都必须是增强型能力，不阻断主流程：

- 刷新失败：
  - 继续使用旧 guidance
  - 如果没有旧 guidance，则退回默认 prompt
- 手动刷新失败：
  - 页面提示失败
  - 不影响用户继续面试或生成
- LLM 返回坏 JSON：
  - 记录错误
  - 不覆盖旧 memory

## 14. Migration Strategy

迁移顺序：

1. 新增 type 和 state 字段
2. 保留旧 `generationGuidance`
3. 把 `recordFeedbackEvent` 改成只记 event + 标记 dirty
4. 实现 evidence builder
5. 实现 `synthesizePositionMemory`
6. 接入懒刷新
7. 接入岗位页手动刷新
8. UI 展示 refresh usage
9. 最后切换 prompt 使用 `generationMemory.*GuidancePrompt`

## 15. Acceptance Criteria

满足以下条件视为完成：

- feedback event 写入后不再立刻调用 guidance synthesis
- 问题生成前可按条件触发 question memory 懒刷新
- 面评生成前可按条件触发 summary memory 懒刷新
- 岗位页可手动点击 `更新 AI 指引`
- 刷新动作对用户可见
- 刷新 token usage 单独展示
- guidance 内容来自 memory items 渲染，不再是频次列表拼接
- 刷新失败不阻断问题生成或面评生成

## 16. Tests

需要覆盖：

- event -> dirty scope
- event -> evidence packet
- lazy refresh condition
- manual refresh bypass threshold
- memory LLM response parsing
- invalid memory response fallback
- position page 手动刷新按钮 UI
- interview panel / summary editor 刷新中状态
- refresh usage 与 generation usage 分开展示
- 无 memory / 刷新失败时的回退行为
