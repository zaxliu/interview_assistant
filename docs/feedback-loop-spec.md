# Feedback Loop Spec

## 1. Goal

将面试系统从开环改为闭环：

- 采集用户对 AI 生成问题与面评的真实使用反馈
- 自动生成岗位级“历史反馈指引”
- 在后续问题生成与面评生成时自动注入指引
- 在 Usage 后台展示闭环效果指标，支持持续优化

本方案优先保证：

- 低侵入（不改主流程入口）
- 可回滚（无反馈时可降级为原行为）
- 可观测（有明确事件与指标）

---

## 2. Scope And Decisions

已确认的产品/实现决策：

- 指引作用域：**按岗位汇总**
- 更新时机：**每次编辑增量更新**
- 采纳定义：**问题状态变为 `asked`**
- 面评反馈：**全文语义对比**
- 对比触发：**保存后延迟批处理（15s 静默窗口）**
- 反馈窗口：**最近 20 位候选人的事件样本**
- 指引接入：**自动注入 Prompt**
- 指引长度：**上限约 1200 中文字符**
- Usage 展示：**结果指标优先 + 按岗位下钻**

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

- `aiBatchId?: string`
- `originalText?: string`

### 3.4 新增类型

- `FeedbackEventType`
  - `question_asked`
  - `question_deleted`
  - `question_edited`
  - `summary_rewritten`
- `FeedbackEvent`
  - `id`
  - `type`
  - `createdAt`
  - `candidateId`
  - `questionId?`
  - `details?`
- `GenerationGuidance`
  - `questionGuidance`
  - `summaryGuidance`
  - `updatedAt`
  - `sampleSize`

---

## 4. Runtime Flow

## 4.1 问题生成与反馈采集

入口：`InterviewPanel`

1. 用户点击“生成面试问题”
2. 调用 `generateInterviewQuestions(...)` 时注入岗位问题指引（若存在）
3. 生成问题写入时附带 `aiBatchId` 与 `originalText`
4. 反馈采集：
   - AI 题标记 `asked` -> `question_asked`
   - AI 题编辑 -> `question_edited`
   - AI 题删除 -> `question_deleted`
5. 每次写入反馈事件后，自动刷新岗位指引

相关文件：

- `src/components/interview/InterviewPanel.tsx`
- `src/components/interview/QuestionCard.tsx`
- `src/store/positionStore.ts`

## 4.2 面评生成与反馈采集

入口：`SummaryEditor`

1. 用户触发 AI 生成面评
2. 调用 `generateInterviewSummary(...)` 时注入岗位面评指引（若存在）
3. 生成成功后保存 `lastGeneratedSummaryDraft`
4. 用户编辑面评过程中自动保存
5. 15 秒静默后触发 `analyzeSummaryRewrite(draft, final)`
6. 将提炼出的偏好写入 `summary_rewritten` 事件
7. 事件写入后自动刷新岗位指引

相关文件：

- `src/components/summary/SummaryEditor.tsx`
- `src/api/ai.ts`
- `src/hooks/useAI.ts`
- `src/store/positionStore.ts`

## 4.3 指引生成逻辑

核心模块：`src/lib/guidance.ts`

逻辑要点：

1. 从岗位 `feedbackEvents` 取最近事件，并按最近 20 位候选人过滤窗口
2. 问题指引聚合：
   - 高采纳维度
   - 高采纳来源
   - 常见题干改写模式
3. 面评指引聚合：
   - 常见改写偏好
   - 改写幅度分布
4. 生成两段指引文本并执行长度裁剪（默认 1200）
5. 返回 `GenerationGuidance`

---

## 5. Prompt Injection Spec

位置：`src/api/ai.ts`

## 5.1 问题生成

- `generateQuestions(..., guidance?)`
- 当 `guidance` 非空，插入段落：
  - `## 岗位历史反馈指引（请优先遵守）`

## 5.2 面评生成

- `generateSummary(..., guidance?)`
- 当 `guidance` 非空，插入段落：
  - `岗位历史反馈指引（请优先遵守）`

## 5.3 面评改写分析

- 新增 `analyzeSummaryRewrite(...)`
- 输出：
  - `rewrite_intensity`: `low | medium | high`
  - `preferences`: 偏好列表（最多 6 条）

---

## 6. Metrics And Usage Dashboard

## 6.1 新增事件名

事件来源：

- 业务反馈事件：`question_asked`, `question_deleted`, `question_edited`, `summary_rewritten`
- 指引行为事件：`guidance_generated`, `guidance_applied_to_question_generation`, `guidance_applied_to_summary_generation`

## 6.2 后端聚合接口

位置：`scripts/metrics-server.mjs`

新增：

- `GET /api/metrics/dashboard/feedback`

返回：

- `totals`
  - 问题采纳率 `questionAdoptionRate = asked / (asked + deleted)`
  - 问题改写率 `questionRewriteRate = edited / asked`
  - 面评改写事件数 `summaryRewritten`
  - 指引命中率 `guidanceHitRate`
- `byPosition`
  - 按岗位聚合的同口径指标

## 6.3 前端展示

位置：`src/pages/UsageAdminPage.tsx`

新增“反馈闭环看板”：

- 首屏卡片：采纳率、改写率、面评改写事件、命中率
- 表格：按岗位展示采纳率/改写率/面评改写/指引生成次数

---

## 7. Storage, Compatibility, And Safety

- 继续使用现有本地存储与 metrics 服务，不新增独立后端
- 新字段均为可选，旧数据可直接读取
- 无指引时自动降级到默认提示词，不阻断流程
- 语义对比失败不阻断保存与提交流程

---

## 8. Tests And Verification

当前已补测试：

- `src/lib/guidance.test.ts`
  - 指引聚合生成
  - 空事件降级文案
- `src/store/positionStore.test.ts`
  - 反馈事件落库与指引生成联动
- `src/components/summary/SummaryEditor.test.tsx`
  - 面评链路参数与行为回归
- `src/components/interview/InterviewPanel.test.tsx`
  - 问题链路回归

建议持续回归命令：

```bash
npm run test -- src/lib/guidance.test.ts src/store/positionStore.test.ts src/components/summary/SummaryEditor.test.tsx src/components/interview/InterviewPanel.test.tsx
npm run build
```

---

## 9. Known Limitations

- 指引窗口目前按“最近候选人集合”近似，不是严格“最近 20 次完整面试”
- 面评改写事件目前按偏好多条写入，需结合 Usage 看板解释口径
- 指引文本为统计拼接，尚未做更高级的规则冲突消解

---

## 10. Next Iteration Suggestions

- 增加事件去重与幂等 key（避免跨页面重复上报）
- 引入“采纳后表现”标签（如是否导出、是否通过）提升指引质量
- 对指引引入版本号和 A/B 开关，支持线上效果验证

