# Feedback Loop Spec v2

## Changelog

基于 v1 的改进：

| # | 类别 | 改进点 |
|---|------|--------|
| 1 | 数据正确性 | 修正 `guidanceHitRate` 计算口径 |
| 2 | 数据正确性 | 补齐 `question_edited` / `question_deleted` 事件采集入口 |
| 3 | 数据正确性 | 修正"最近 20 位候选人"窗口取法 |
| 4 | 设计改进 | 合并 `summary_rewritten` 事件，避免事件爆炸 |
| 5 | 设计改进 | 面评改写分析增加最小改写阈值 |
| 6 | 设计改进 | 明确指引注入位置与理由 |
| 7 | 设计改进 | 修复指引聚合中的空 key 问题 |
| 8 | Spec 补全 | 记录已有的事件去重逻辑 |
| 9 | Spec 补全 | 增加错误处理矩阵 |
| 10 | Spec 补全 | 对齐 Spec 与实现的细节差异 |

---

## 1. Goal

将面试系统从开环改为闭环：

- 采集用户对 AI 生成问题与面评的真实使用反馈
- 自动生成岗位级"历史反馈指引"
- 在后续问题生成与面评生成时自动注入指引
- 在 Usage 后台展示闭环效果指标，支持持续优化

本方案优先保证：

- 低侵入（不改主流程入口）
- 可回滚（无反馈时可降级为原行为）
- 可观测（有明确事件与指标）

---

## 2. Scope And Decisions

已确认的产品/实现决策：

| 决策项 | 结论 | 备注 |
|--------|------|------|
| 指引作用域 | 按岗位汇总 | |
| 更新时机 | 每次写入反馈事件后增量更新 | |
| 采纳定义 | 问题状态变为 `asked` | |
| 面评反馈 | 全文语义对比 | |
| 对比触发 | 保存后延迟批处理（15s 静默窗口） | v2: 增加最小改写阈值 |
| 反馈窗口 | 最近 20 位候选人的事件样本 | v2: 修正窗口取法 |
| 指引接入 | 自动注入 Prompt | v2: 明确注入位置 |
| 指引长度 | 上限约 1200 中文字符 | |
| Usage 展示 | 结果指标优先 + 按岗位下钻 | |
| 事件模型 | 一次改写分析 = 一条事件 | v2: 不再按 preference 拆行 |

---

## 3. Data Model

位置：`src/types/index.ts`

### 3.1 Position 扩展

- `feedbackEvents?: FeedbackEvent[]`
- `generationGuidance?: GenerationGuidance`

### 3.2 Candidate 扩展

- `lastQuestionBatchId?: string`
- `lastGeneratedSummaryDraft?: InterviewResult`

### 3.3 Question 扩展

- `aiBatchId?: string` — 同批次生成的题目共享此 ID
- `originalText?: string` — 生成时的原始文本，用于对比编辑

> **v2 注意**：`originalText` 必须在问题生成写入时赋值（与 `text` 相同），否则后续无法判定是否被编辑。见 §4.1 步骤 3。

### 3.4 新增类型

```typescript
type FeedbackEventType =
  | 'question_asked'
  | 'question_deleted'
  | 'question_edited'
  | 'summary_rewritten';

interface FeedbackEvent {
  id: string;
  type: FeedbackEventType;
  createdAt: string;
  candidateId: string;
  questionId?: string;
  details?: Record<string, string | number | boolean | string[]>;
  //                                                    ^^^^^^^^
  // v2: details 值类型增加 string[]，用于存储 preferences 数组
}

interface GenerationGuidance {
  questionGuidance: string;
  summaryGuidance: string;
  updatedAt: string;
  sampleSize: number;
}
```

---

## 4. Runtime Flow

### 4.1 问题生成与反馈采集

入口：`InterviewPanel`

1. 用户点击"生成面试问题"
2. 调用 `generateQuestions(...)` 时注入岗位问题指引（若存在）
3. **生成问题写入时附带 `aiBatchId`、`originalText`（= 当前 `text`）**
4. 反馈采集（三个独立埋点）：

| 事件 | 触发条件 | 埋点位置 | 去重规则 |
|------|---------|---------|---------|
| `question_asked` | AI 题 status 变为 `asked`（含手动标记和会议纪要提取） | `QuestionCard` 状态切换回调 + `InterviewPanel` 会议纪要提取 | 同 candidateId + questionId 只记一次 |
| `question_edited` | AI 题 `text !== originalText` 且用户完成编辑（blur） | `QuestionCard` 编辑完成回调 | 同 candidateId + questionId 只记一次 |
| `question_deleted` | 用户删除 AI 题 | `QuestionCard` 或 `InterviewPanel` 删除回调 | 不去重（删除是终态） |

5. 每次写入反馈事件后，自动刷新岗位指引

> **v2 变更**：v1 仅在会议纪要提取路径记录 `question_asked`，手动标 asked 不记录。v2 要求在 `QuestionCard` 的状态切换回调中同样记录。`question_edited` 和 `question_deleted` 在 v1 中未实现，v2 明确埋点位置。

相关文件：

- `src/components/interview/InterviewPanel.tsx`
- `src/components/interview/QuestionCard.tsx`
- `src/store/positionStore.ts`

### 4.2 面评生成与反馈采集

入口：`SummaryEditor`

1. 用户触发 AI 生成面评
2. 调用 `generateSummary(...)` 时注入岗位面评指引（若存在）
3. 生成成功后保存 `lastGeneratedSummaryDraft`
4. 用户编辑面评过程中自动保存
5. **最小改写阈值检查**：仅当 draft 与 final 的 `JSON.stringify` 长度差异 > 5% 或结构性字段（`overall_result`、`comprehensive_score`、`interview_conclusion`）发生变化时，才进入步骤 6
6. 15 秒静默后触发 `analyzeSummaryRewrite(draft, final)`
7. **将分析结果作为一条 `summary_rewritten` 事件写入**，`details` 结构如下：

```typescript
{
  rewriteIntensity: 'low' | 'medium' | 'high',
  preferences: string[],  // 最多 6 条
}
```

8. 事件写入后自动刷新岗位指引

> **v2 变更**：
> - 增加步骤 5 最小改写阈值，避免标点修改触发 AI 分析浪费 token
> - 步骤 7 改为一次分析一条事件（v1 按 preference 拆为多条，导致事件爆炸）

相关文件：

- `src/components/summary/SummaryEditor.tsx`
- `src/api/ai.ts`
- `src/hooks/useAI.ts`
- `src/store/positionStore.ts`

### 4.3 指引生成逻辑

核心模块：`src/lib/guidance.ts`

**步骤**：

1. **候选人窗口**：从岗位全量 `feedbackEvents` 中提取所有 `candidateId`，按事件最晚出现时间排序，取最近 20 个候选人
2. **事件筛选**：取这 20 个候选人的全部事件（不设硬上限）
3. 问题指引聚合：
   - 高采纳维度（按 `evaluationDimension` 计数，**过滤空值**）
   - 高采纳来源（按 `source` 计数，**过滤空值**）
   - 常见题干改写模式（按 `editPattern` 计数）
4. 面评指引聚合：
   - 常见改写偏好（从 `details.preferences` 数组展开后计数）
   - 改写幅度分布（按 `details.rewriteIntensity` 计数）
5. 生成两段指引文本并执行长度裁剪（默认 1200 字符）
6. 返回 `GenerationGuidance`

> **v2 变更**：
> - 步骤 1-2：v1 先取最近 200 条事件再从中取 20 个候选人，当单个候选人事件量大时会挤出其他候选人。v2 改为先确定候选人集合再取事件。
> - 步骤 3：v1 的 `String(event.details?.evaluationDimension || '')` 会产生空字符串 key。v2 要求过滤空值 key。
> - 步骤 4：适配新的单条事件 + `preferences` 数组格式。

---

## 5. Prompt Injection Spec

位置：`src/api/ai.ts`

### 5.1 问题生成

- `generateQuestions(..., guidance?)`
- 当 `guidance` 非空，在 **system prompt 末尾**插入段落：

```
## 岗位历史反馈指引（请优先遵守）
{guidance}
```

> **v2 变更**：将指引从 user prompt 开头移至 system prompt 末尾。理由：user prompt 中 JD + 简历文本通常很长（数千 token），指引放在 user prompt 开头容易被后续内容冲淡（primacy 被覆盖）。放在 system prompt 末尾可利用 system prompt 的高优先级语义。

### 5.2 面评生成

- `generateSummary(..., guidance?)`
- 当 `guidance` 非空，在 **system prompt 末尾**插入段落：

```
岗位历史反馈指引（请优先遵守）：
{guidance}
```

### 5.3 面评改写分析

- `analyzeSummaryRewrite(draft, final)`
- 输出：

```typescript
interface SummaryRewriteInsight {
  rewriteIntensity: 'low' | 'medium' | 'high';
  preferences: string[];  // 最多 6 条
}
```

- 此函数不注入指引（它是指引的数据来源，不是消费方）

---

## 6. Event Deduplication

位置：`src/store/positionStore.ts` — `shouldSkipDuplicateFeedback`

### 6.1 去重规则

| 事件类型 | 去重 key | 说明 |
|---------|---------|------|
| `question_asked` | `type + candidateId + questionId` | 同一题目只记一次采纳 |
| `question_edited` | `type + candidateId + questionId` | 同一题目只记一次编辑（首次编辑即可反映改写意图） |
| `question_deleted` | 不去重 | 删除是终态操作，且同一题目不可能重复删除 |
| `summary_rewritten` | 不去重 | 由 `SummaryEditor` 的 signature 引用去重保证同一 draft+final pair 不会重复触发分析；不同 pair 代表不同轮次编辑，应分别记录 |

> **v2 新增**：v1 Spec 未记录去重逻辑，但实现中已存在 `shouldSkipDuplicateFeedback`。v2 正式纳入 Spec。

---

## 7. Metrics And Usage Dashboard

### 7.1 事件名

业务反馈事件（存入 `Position.feedbackEvents`，同时通过 `trackEvent` 上报 metrics）：

- `question_asked`
- `question_deleted`
- `question_edited`
- `summary_rewritten`

指引行为事件（仅通过 `trackEvent` 上报 metrics，不存入 feedbackEvents）：

- `guidance_generated`
- `guidance_applied_to_question_generation`
- `guidance_applied_to_summary_generation`

生成请求事件（已有，用作命中率分母）：

- `question_generation_succeeded`
- `summary_generation_succeeded`

### 7.2 后端聚合接口

位置：`scripts/metrics-server.mjs`

新增：`GET /api/metrics/dashboard/feedback`

返回：

```typescript
{
  totals: {
    questionAdoptionRate: number;   // asked / (asked + deleted)
    questionRewriteRate: number;    // edited / asked
    summaryRewritten: number;       // summary_rewritten 事件总数
    guidanceHitRate: number;        // v2 修正，见下方
  };
  byPosition: Array<{
    positionId: string;
    positionTitle?: string;
    questionAdoptionRate: number;
    questionRewriteRate: number;
    summaryRewritten: number;
    guidanceGenerated: number;
  }>;
}
```

### 7.3 `guidanceHitRate` 计算口径（v2 修正）

```
guidanceHitRate =
  (guidance_applied_to_question_generation + guidance_applied_to_summary_generation)
  /
  (question_generation_succeeded + summary_generation_succeeded)
```

**语义**：在所有 AI 生成请求中，有多少比例的请求注入了指引。

> **v2 变更**：v1 的分母是 `max(guidanceGenerated, appliedCount)`，其中 `guidanceGenerated` 是指引合成次数，与"生成请求次数"无关，导致命��率含义不清。v2 改用实际生成请求总数作为分母。

### 7.4 前端展示

位置：`src/pages/UsageAdminPage.tsx`

新增"反馈闭环看板"：

- 首屏卡片：采纳率、改写率、面评改写事件数、命中率
- 表格：按岗位展示采纳率 / 改写率 / 面评改写 / 指引生成次数

---

## 8. Error Handling

### 8.1 Error Matrix

| 调用点 | 失败场景 | 降级策略 | 是否阻断主流程 |
|--------|---------|---------|--------------|
| `generateQuestions` 注入指引 | 指引字段为空或格式异常 | 跳过注入，使用无指引 prompt | 否 |
| `generateSummary` 注入指引 | 指引字段为空或格式异常 | 跳过注入，使用无指引 prompt | 否 |
| `analyzeSummaryRewrite` | API 超时 / 网络错误 | 静默跳过，不写入反馈事件，不阻断面评保存 | 否 |
| `analyzeSummaryRewrite` | 返回非法 JSON / 字段缺失 | 静默跳过，console.warn 记录 | 否 |
| `synthesizeGenerationGuidance` | events 数据损坏 / 异常 | catch 后返回默认降级文案（"暂无足够反馈…"） | 否 |
| `recordFeedbackEvent` | 写入失败（如 localStorage 满） | 静默跳过，不影响用户操作 | 否 |
| `trackEvent` (metrics 上报) | 网络错误 | 静默丢弃，metrics 本身为尽力上报 | 否 |

### 8.2 设计原则

- 反馈闭环是增强功能，**任何环节失败均不得阻断面试主流程**（问题生成、面评编辑、面评保存）
- 所有 AI 调用失败静默降级，仅 console.warn
- `analyzeSummaryRewrite` 失败时不更新 `lastRewriteSignatureRef`，允许下一次编辑触发重试

---

## 9. Storage, Compatibility, And Safety

- 继续使用现有本地存储与 metrics 服务，不新增独立后端
- 新字段均为可选，旧数据可直接读取
- 无指引时自动降级到默认提示词，不阻断流程
- 语义对比失败不阻断保存与提交流程
- `FeedbackEvent.details` 值类型扩展为 `string | number | boolean | string[]`，旧事件的 `string` 值类型保持兼容

---

## 10. Tests And Verification

当前已补测试：

- `src/lib/guidance.test.ts`
  - 指引聚合生成
  - 空事件降级文案
  - **v2 新增**：空 key 过滤、新事件格式（preferences 数组）聚合
- `src/store/positionStore.test.ts`
  - 反馈事件落库与指引生成联动
  - **v2 新增**：去重逻辑验证、`question_edited` / `question_deleted` 事件写入
- `src/components/summary/SummaryEditor.test.tsx`
  - 面评链路参数与行为回归
  - **v2 新增**：最小改写阈值跳过验证、单条事件写入验证
- `src/components/interview/InterviewPanel.test.tsx`
  - 问题链路回归
- **v2 新增** `src/components/interview/QuestionCard.test.tsx`
  - `question_asked` 手动标记埋点
  - `question_edited` 编辑完成埋点
  - `question_deleted` 删除埋点

建议持续回归命令：

```bash
npm run test -- src/lib/guidance.test.ts src/store/positionStore.test.ts src/components/summary/SummaryEditor.test.tsx src/components/interview/InterviewPanel.test.tsx
npm run build
```

---

## 11. Implementation Checklist

按优先级排序的实施清单：

### P0 — 数据正确性（不修则核心指标无意义）

- [ ] `QuestionCard`：在编辑完成回调中记录 `question_edited` 事件（条件：`isAIGenerated && text !== originalText`）
- [ ] `QuestionCard` / `InterviewPanel`：在删除 AI 题时记录 `question_deleted` 事件
- [ ] `QuestionCard`：在手动切换 status 为 `asked` 时记录 `question_asked` 事件（当前仅会议纪要路径记录）
- [ ] `InterviewPanel`：生成问题写入时设置 `originalText = text`
- [ ] `metrics-server.mjs`：修正 `guidanceHitRate` 公式，分母改用 `question_generation_succeeded + summary_generation_succeeded`

### P1 — 设计改进（提升数据质量与资源效率）

- [ ] `SummaryEditor`：合并 preferences 为单条 `summary_rewritten` 事件
- [ ] `SummaryEditor`：增加最小改写阈值检查（长度差异 > 5% 或结构性字段变化）
- [ ] `guidance.ts`：修正候选人窗口取法——先取最近 20 个候选人 ID，再筛选其全部事件
- [ ] `guidance.ts`：修复空 key 问题——`countBy` 的 keyBuilder 不传 `|| ''` fallback
- [ ] `guidance.ts`：适配新的单条事件 + `preferences` 数组格式

### P2 — 注入优化（需 A/B 验证效果）

- [ ] `ai.ts`：将指引从 user prompt 开头移至 system prompt 末尾

### P3 — 可观测与测试

- [ ] 补充 `QuestionCard.test.tsx` 三类事件埋点测试
- [ ] 补充 `guidance.test.ts` 空 key 过滤和新事件格式测试
- [ ] 补充 `SummaryEditor.test.tsx` 阈值跳过和单条事件测试

---

## 12. Known Limitations

- 指引窗口按"最近 20 个有事件的候选人"近似，不是严格"最近 20 次完整面试"
- 指引文本为统计拼接，尚未做更高级的规则冲突消解
- `question_edited` 的 `editPattern` 取决于人工比对 `originalText` 与 `text` 的差异描述，暂无自动分类
- 面评改写分析的 `preferences` 质量依赖 AI 模型输出，无硬校验
- 指引注入位置（system prompt 末尾 vs user prompt）的效果差异未经 A/B 验证

---

## 13. Next Iteration Suggestions

- 引入"采纳后表现"标签（如是否导出、是否通过）提升指引质量
- 对指引引入版本号和 A/B 开关，支持线上效果验证
- `question_edited` 自动分类 editPattern（如"简化措辞"、"增加追问"、"更换维度"），减少人工标注
- 面评改写分析增加 `confidence` 字段，低置信度结果不写入事件
- 考虑将 feedbackEvents 从 Position 对象中分离到独立存储，避免 localStorage 膨胀
