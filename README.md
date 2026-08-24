# Policy Delta

一个无前端框架、无运行时依赖的亚太 HR 政策对比网站。页面默认把旧规与新规并排呈现，并显示差异、HR 动作、核验时间和官方来源。

## 已实现

- 新旧政策对比优先的响应式页面，支持关键字、法域、政策类型筛选。
- 8 项已回查官方来源的示例政策，覆盖中国香港、中国台湾、日本、韩国和澳大利亚。
- 仅从 `data/sources.json` 中的 HTTPS 官方域名白名单抓取内容。
- 默认使用不需要 API 的免费监测：只比较官方页面内容哈希，不自动改写政策。
- GitHub Actions 每周一检查一次官方页面，发现变化时创建 GitHub Issue 提醒人工核对。
- 保留可选的 OpenAI 提取与双重审计脚本，但当前工作流不会调用它，也不需要配置 API 密钥。
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

## 当前默认：免费每周监测

`.github/workflows/policy-refresh.yml` 会在每周一北京时间约 09:17 运行：

1. 读取 `data/sources.json` 中启用的官方页面。
2. 运行 `scripts/check-source-changes.mjs`，只比较官网正文哈希。
3. 首次运行建立基准；之后发现变化时创建 GitHub Issue，并附上需要核对的官方链接。
4. 人工确认政策确实发生变化后，再修改 `data/policies.json` 并提交，GitHub Pages 会更新网站。

这种模式不使用 OpenAI API，不需要付款信息，也不会自动把未经确认的内容发布到网站。

## 可选：配置 AI 辅助更新

只有在以后主动恢复 AI 辅助提取时，才需要复制 `.env.example` 中的变量到服务器、CI 或密钥管理平台。不要把真实 API key 写入 `.env.example`、前端 JavaScript或 Git 提交记录。

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

## 定时监测与部署

将此目录作为 Git 仓库根目录推送到 GitHub：

1. 启用 `.github/workflows/policy-refresh.yml`，无需添加任何密钥。
2. 在仓库中保持 `Issues` 功能开启，用于接收官网变化提醒。
3. 将静态文件部署到 GitHub Pages、Cloudflare Pages、Netlify、Vercel 或任意静态托管服务。
4. 收到变化提醒后，由人工对照官方原文，确认无误再修改 `data/policies.json`。

工作流采用 UTC cron，每周一 01:17 运行，对应北京时间约 09:17；GitHub 对定时任务可能有少量延迟。人工提交 `data/policies.json` 后，GitHub Pages 会重新部署。

## 添加监测源

1. 在 `data/policies.json` 添加经过人工核验的政策基线。
2. 在 `data/sources.json` 添加相同 `policyId` 的监测配置。
3. `officialDomains` 只列官方机构域名；`urls` 使用具体、稳定、公开的政策页面。
4. 运行 `npm test` 和 `npm run validate`。
5. 在 GitHub Actions 手动运行一次 `Weekly official source monitor`，为新来源建立监测基准。

当前抓取器面向 HTML/文本页面。若官方来源只有 PDF，建议增加受控的 PDF 文本提取器并保存页码证据，不要把 PDF 二进制内容直接交给现有 HTML 解析逻辑。

## 数据与界面文件

```text
index.html                      页面结构
styles.css                     响应式视觉样式
app.js                         筛选、渲染和定时重载
data/policies.json             正式发布的数据
data/sources.json              官方监测源与域名白名单
data/sync-state.json           内容哈希与最近检查状态
data/monitor-state.json        免费监测生成的页面哈希状态
data/monitor-report.md         免费监测生成的最近一次检查报告
data/review-queue/             审核记录与候选项
scripts/check-source-changes.mjs  免费官网变化监测
scripts/sync-policies.mjs      抓取、AI 提取、校验和审计
scripts/approve-policy.mjs     人工批准后发布
scripts/validate-data.mjs      数据完整性检查
```

## 校验

```bash
npm test
npm run validate
```

页面使用 DOM `textContent` 渲染政策数据，不将外部文本作为 HTML 注入。当前免费工作流不使用 API key；如以后启用可选 AI 脚本，密钥也只能保存在服务端安全变量中，永远不能发送到浏览器。

## 免责声明

该项目用于政策信息整理，不构成法律、税务或移民意见。正式决策必须回到页面所列官方原文，并由相应法域的专业人士复核。
