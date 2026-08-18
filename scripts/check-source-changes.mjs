import process from "node:process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertOfficialUrl,
  htmlToText,
  projectRoot,
  readJson,
  sha256,
  writeJsonAtomic,
} from "./lib.mjs";

const fetchTimeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 25_000);
const statePath = "data/monitor-state.json";
const reportPath = "data/monitor-report.md";

async function readState() {
  try {
    return await readJson(statePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return { schemaVersion: 1, lastCheckedAt: null, sources: {} };
  }
}

async function fetchOfficialPage(url, source) {
  assertOfficialUrl(url, source.officialDomains);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "PolicyDelta/1.0 (+official-policy-monitor; contact=site-admin)",
      "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(fetchTimeoutMs),
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  assertOfficialUrl(response.url, source.officialDomains);

  const contentType = response.headers.get("content-type") || "";
  if (!/(text|html|xhtml)/i.test(contentType)) {
    throw new Error(`不支持的内容类型：${contentType || "未知"}`);
  }

  const text = htmlToText(await response.text()).slice(0, 180_000);
  if (text.length < 120) throw new Error("正文过短，可能被拦截或网页结构已改变");
  return `${url}\n${text}`;
}

function sourceLabel(source) {
  return source.authority || source.id;
}

function buildReport({ checkedAt, changed, initialized, unchanged, failures }) {
  const lines = [
    "# 官方政策来源每周检查",
    "",
    `检查时间：${checkedAt}`,
    "",
    `- 发现变化：${changed.length}`,
    `- 首次建立基准：${initialized.length}`,
    `- 内容未变化：${unchanged.length}`,
    `- 抓取失败：${failures.length}`,
    "",
  ];

  if (changed.length > 0) {
    lines.push("## 需要人工核对", "");
    for (const item of changed) {
      lines.push(
        `### ${sourceLabel(item.source)}`,
        "",
        `监测重点：${item.source.watchFor || "请检查政策正文与生效日期"}`,
        "",
        ...item.source.urls.map((url) => `- [打开官方来源](${url})`),
        "",
        "> 提醒：这里只能确认官网页面内容发生变化，不能自动判断政策是否已经正式修改。请核对官方正文后再更新网站。",
        "",
      );
    }
  }

  if (initialized.length > 0) {
    lines.push("## 已建立监测基准", "");
    for (const item of initialized) {
      lines.push(`- ${sourceLabel(item.source)}：以后会与本次抓取结果比较。`);
    }
    lines.push("");
  }

  if (failures.length > 0) {
    lines.push("## 本次未能检查", "");
    for (const item of failures) {
      lines.push(`- ${sourceLabel(item.source)}：${item.error}`);
    }
    lines.push("", "这些来源会在下次运行时再次尝试。", "");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8");
}

const [sourceConfig, state] = await Promise.all([
  readJson("data/sources.json"),
  readState(),
]);

state.sources ||= {};
const checkedAt = new Date().toISOString();
const changed = [];
const initialized = [];
const unchanged = [];
const failures = [];

for (const source of sourceConfig.sources.filter((item) => item.enabled)) {
  try {
    console.log(`检查 ${source.id}...`);
    const pages = [];
    for (const url of source.urls) pages.push(await fetchOfficialPage(url, source));

    const contentHash = sha256(pages.join("\n\n"));
    const previousHash = state.sources[source.id]?.contentHash;
    const result = { source, contentHash, previousHash };

    if (!previousHash) initialized.push(result);
    else if (previousHash !== contentHash) changed.push(result);
    else unchanged.push(result);

    state.sources[source.id] = {
      contentHash,
      lastCheckedAt: checkedAt,
      status: previousHash && previousHash !== contentHash ? "changed-needs-review" : previousHash ? "unchanged" : "baseline-created",
    };
  } catch (error) {
    failures.push({ source, error: error.message });
    state.sources[source.id] = {
      ...state.sources[source.id],
      lastCheckedAt: checkedAt,
      status: "fetch-error",
      error: error.message,
    };
    console.error(`${source.id} 检查失败：${error.message}`);
  }
}

state.lastCheckedAt = checkedAt;
const report = buildReport({ checkedAt, changed, initialized, unchanged, failures });

await writeJsonAtomic(statePath, state);
await writeFile(path.join(projectRoot, reportPath), report, "utf8");
await setOutput("changed_count", changed.length);
await setOutput("failure_count", failures.length);

if (process.env.GITHUB_STEP_SUMMARY) {
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report, "utf8");
}

console.log(`检查完成：变化 ${changed.length}，首次基准 ${initialized.length}，未变化 ${unchanged.length}，失败 ${failures.length}。`);
if (initialized.length === 0 && changed.length === 0 && unchanged.length === 0) {
  throw new Error("所有官方来源均抓取失败，请检查来源地址或网络状态");
}
