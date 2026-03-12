# Wintalent 一键上传与解析整合计划

更新时间：2026-03-12

## 目标

在当前前端应用中支持用户输入 Wintalent 面试链接后，一键完成：

1. 解析并拉取 PDF 简历  
2. 在前端自动进入现有 PDF 文本提取 + AI 结构化流程  
3. 回填候选人简历文本与亮点

## 现状

1. 当前系统支持：
   - 本地上传 PDF
   - 直接输入可公开访问的 PDF URL
2. Wintalent 链接目前不支持直接解析，用户需要手动下载/解压再上传。
3. 已补充最小后端代理：`scripts/wintalent-proxy.mjs`
   - `POST /api/wintalent/resolve`
   - `POST /api/wintalent/download`

## 建议集成阶段

## 阶段 1（最小可用）

1. 新增后端进程（wintalent-proxy）部署能力  
2. 前端新增“Wintalent 链接解析”按钮  
3. 点击后调用 `POST /api/wintalent/download` 获取 PDF Blob  
4. 将 Blob 转成 `File`，复用现有 `parseFromFile` 流程  
5. 解析成功后自动填充：
   - `resumeFilename`
   - `resumeRawText`
   - `resumeText`（格式化后）
   - `resumeHighlights`

验收标准：

1. 用户只需粘贴链接 + 点击一次按钮即可看到简历文本  
2. 失败时给出可读错误（链接失效/权限不足/网络失败）

## 阶段 2（稳定性与可观测）

1. 后端增加结构化错误码：
   - `LINK_EXPIRED`
   - `AUTH_REQUIRED`
   - `NO_ORIGINAL_RESUME_PERMISSION`
   - `PDF_FETCH_FAILED`
2. 前端错误提示映射到中文文案  
3. 增加请求超时与重试策略（仅 token 创建和关键查询接口）  
4. 增加日志字段：
   - traceId
   - interviewUrl hash
   - resumeId
   - 耗时分段

## 阶段 3（产品化）

1. 候选人表单支持自动识别 Wintalent 链接类型  
2. 同步保存原始 PDF（沿用 IndexedDB 或对象存储）  
3. 支持批量导入链接并队列解析  
4. 增加权限与速率限制，避免代理被滥用

## 前端改动点建议

1. `src/components/candidates/CandidateForm.tsx`
   - 增加 Wintalent 输入与按钮
   - 新增 `handleWintalentImport`
2. `src/hooks/usePDFParser.ts`
   - 新增 `parseFromBlob`（或复用 `parseFromFile`）
3. `src/api/pdf.ts`
   - 增加 `fetchWintalentPDF(interviewUrl)` 封装

## 后端改动点建议

1. 先用现有 `scripts/wintalent-proxy.mjs` 跑通
2. 后续迁移到正式后端框架（如 Express/Fastify/Nest）时保留相同 API 协议
3. 生产必须加：
   - 白名单/鉴权
   - 请求频率限制
   - 审计日志

## 本地联调流程

1. 终端 A：`npm run proxy:wintalent`
2. 终端 B：`npm run dev`
3. 前端通过 `/api/wintalent/*` 调用代理（开发时可在 Vite 增加 proxy）

## 风险与应对

1. 风险：Wintalent 接口参数或 token 机制变化  
   - 应对：把关键步骤封装为独立函数，增加集成测试样本
2. 风险：Cookie / 会话失效导致间歇失败  
   - 应对：失败时自动重新从入口链接走全链路，不复用旧会话
3. 风险：代理被当作通用下载器滥用  
   - 应对：仅允许 `wintalent.cn` 域名输入 + 身份鉴权 + 限流

