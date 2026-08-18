# Policy Delta

一个无前端框架、无运行时依赖的亚太 HR 政策对比网站。页面默认把旧规与新规并排呈现，并显示差异、HR 动作、核验时间和官方来源。

## 已实现

- 新旧政策对比优先的响应式页面，支持关键字、法域、政策类型筛选。
- 8 项已回查官方来源的示例政策，覆盖中国香港、中国台湾、日本、韩国和澳大利亚。
- 仅从 `data/sources.json` 中的 HTTPS 官方域名白名单抓取内容。
- 服务端调用 OpenAI Responses API，并用 Structured Outputs 固定返回结构。
- 两层机器校验：逐字证据定位 + 第二次独立 AI 审计。
- 默认进入人工审核队列；可选开启“全部门槛通过后自动发布”。
- GitHub Actions 每 12 小时检查一次官方页面。
- 网页每 5 分钟以 `no-store` 方式重新读取已发布政策数据。

## 本地运行

需要 Node.js 20 或更高版本；本项目不需要安装第三方 npm 包。

```bash
npm start
```

浏览器打开 `http://127.0.0.1:4173/`。

Windows PowerShell 如果限制 `npm.ps1`，可使用：

```powershell
npm.cmd start
```

## 配置 AI 更新

复制 `.env.example` 中的变量到你的服务器、CI 或密钥管理平台。不要把真实 API key 写入 `.env.example`、前端 JavaScript 或 Git 提交记录。

必要变量：

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-terra
AUTO_PUBLISH=false
```

运行一次更新检查：

```bash
npm run sync
```

只检查单个来源：

```bash
node scripts/sync-policies.mjs --source hk-minimum-wage
```

`AUTO_PUBLISH=false`（推荐）时，通过全部自动检查的候选项会写入 `data/review-queue/`，但不会出现在正式网页中。

人工复核候选 JSON 与官方页面后，运行：

```bash
npm run approve -- 2026-08-18T01-00-00-000Z-hk-minimum-wage.json
```

批准脚本会更新 `data/policies.json`，并在候选记录中保存批准时间。

## 为什么不默认让 AI 直接发布

政策与法律信息属于高风险内容。模型可以提高提取和比对效率，但不能证明事实本身。默认流程因此是：

1. 只访问预先配置的官方机构域名。
2. 用页面内容哈希识别官网是否变化。
3. AI 比较当前政策与新的官方正文，输出固定 JSON。
4. 程序确认 URL、日期和每条短引文；引文必须逐字存在于抓取正文。
5. 第二次 AI 调用以独立审计者身份复核候选项。
6. 通过后进入人工审核队列；任何不确定性都会失败关闭。

如业务确实接受无人值守发布，可在充分测试后设置 `AUTO_PUBLISH=true`。此模式仍然要求：模型置信度不低于 0.92、无未解决疑点、引文可逐字定位、日期合法、第二次审计为低风险且无问题。

## 定时更新与部署

将此目录作为 Git 仓库根目录推送到 GitHub：

1. 在仓库 `Settings → Secrets and variables → Actions` 添加 `OPENAI_API_KEY`。
2. 启用 `.github/workflows/policy-refresh.yml`。
3. 将静态文件部署到 GitHub Pages、Cloudflare Pages、Netlify、Vercel 或任意静态托管服务。
4. 生产环境建议保持工作流中的 `AUTO_PUBLISH: "false"`，由合规负责人审核候选项后再发布。

工作流采用 UTC cron，每 12 小时运行一次；GitHub 对定时任务可能有少量延迟。静态托管平台应在 `data/policies.json` 提交变化后自动重新部署。

## 添加监测源

1. 在 `data/policies.json` 添加经过人工核验的政策基线。
2. 在 `data/sources.json` 添加相同 `policyId` 的监测配置。
3. `officialDomains` 只列官方机构域名；`urls` 使用具体、稳定、公开的政策页面。
4. 运行 `npm test` 和 `npm run validate`。
5. 首次运行 `npm run sync`，确认候选结果与官方原文一致。

当前抓取器面向 HTML/文本页面。若官方来源只有 PDF，建议增加受控的 PDF 文本提取器并保存页码证据，不要把 PDF 二进制内容直接交给现有 HTML 解析逻辑。

## 数据与界面文件

```text
index.html                      页面结构
styles.css                     响应式视觉样式
app.js                         筛选、渲染和定时重载
data/policies.json             正式发布的数据
data/sources.json              官方监测源与域名白名单
data/sync-state.json           内容哈希与最近检查状态
data/review-queue/             审核记录与候选项
scripts/sync-policies.mjs      抓取、AI 提取、校验和审计
scripts/approve-policy.mjs     人工批准后发布
scripts/validate-data.mjs      数据完整性检查
```

## 校验

```bash
npm test
npm run validate
```

页面使用 DOM `textContent` 渲染政策数据，不将 AI 生成文本作为 HTML 注入。API key 仅在更新脚本和 CI 中使用，永远不发送到浏览器。

## 免责声明

该项目用于政策信息整理，不构成法律、税务或移民意见。正式决策必须回到页面所列官方原文，并由相应法域的专业人士复核。
