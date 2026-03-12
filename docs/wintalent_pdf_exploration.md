# Wintalent PDF 提取探索记录

更新时间：2026-03-12

## 目标

从 Wintalent 面试链接出发，仅用 HTTP 请求链路（`curl`/后端请求）获取原始 PDF 简历流。

## 已验证结论

1. 面试短链会跳转到 `showResume.html`，并设置会话 Cookie。
2. 页面本身不会直接暴露可下载的 PDF 明文链接。
3. 需要先走 token 化接口，再访问业务接口。
4. 最终可得到 PDF 响应（`content-type: application/pdf`），但链接依赖会话 Cookie，裸链会超时跳转。

## 核心链路（已实测）

1. 访问面试链接，跟随 302 到 `showResume.html`，收集 Cookie。
2. 从 Cookie 取 `createTokenUrl`（`/interviewer/common/createToken?...`）。
3. `POST createToken(url=/interviewPlatform/currentResumeInfo)`，拿 token 化 URL。
4. `POST currentResumeInfo`，拿到：
   - `getResumeDetailTypeUrl`
   - `resumeTab[0].applyId/resumeId/postId`
5. `POST getResumeDetailTypeUrl`，拿到：
   - `resumeOriginalInfoUrl`
   - `originalFileId`
   - `encryptId`
6. `POST createToken(url=<resumeOriginalInfoUrl>&lanType=1)`，拿 token 化原始简历 URL。
7. 访问 `<tokenUrl>&showPdf=true`，返回 PDF 二进制流。

## 关键观察

1. `previewResumeAttachment.html` 返回的是预览页面 HTML，不是 PDF 流。
2. `getResumeOriginalInfo?...&showPdf=true` 才是 PDF 流入口。
3. 该入口必须携带同一会话 Cookie。
4. 不带 Cookie 请求会 `302` 到 `timeOutPage.html`。

## 建议后端化原因

1. 前端跨域和 Cookie 受限，难以稳定复现完整链路。
2. token 与会话绑定，前端直连容易失效。
3. 最稳妥方案是后端代理串行执行整条链路并直接回传 PDF。

## 最小可用接口建议

1. `POST /api/wintalent/resolve`
   - 入参：`{ interviewUrl }`
   - 出参：`{ pdfUrl, metadata... }`（调试用）
2. `POST /api/wintalent/download`
   - 入参：`{ interviewUrl }`
   - 出参：PDF 文件流（生产主用）

