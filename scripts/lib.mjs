import { createHash } from "node:crypto";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function readJson(relativePath) {
  const content = await readFile(path.join(projectRoot, relativePath), "utf8");
  return JSON.parse(content);
}

export async function writeJsonAtomic(relativePath, value) {
  const target = path.join(projectRoot, relativePath);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function decodeEntities(value) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»",
  };
  return value
    .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
    .replace(/&#x([0-9a-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

export function htmlToText(html) {
  return normalizeText(decodeEntities(html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")));
}

export function normalizeText(value) {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function assertOfficialUrl(value, allowedDomains) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`无效来源 URL：${value}`);
  }
  if (url.protocol !== "https:") throw new Error(`来源必须使用 HTTPS：${value}`);
  if (!allowedDomains.includes(url.hostname)) throw new Error(`来源域名不在白名单：${url.hostname}`);
  return url;
}

export function validatePolicy(policy, sourceIndex = new Map()) {
  const requiredStrings = ["id", "jurisdiction", "regionCode", "category", "topic", "title", "effectiveDate", "oldRule", "newRule", "deltaSummary", "impactLevel"];
  for (const key of requiredStrings) {
    if (typeof policy[key] !== "string" || !policy[key].trim()) throw new Error(`${policy.id || "未知政策"} 缺少字段 ${key}`);
  }
  if (!isIsoDate(policy.effectiveDate)) throw new Error(`${policy.id} 的 effectiveDate 不是有效 ISO 日期`);
  if (!Array.isArray(policy.hrActions) || policy.hrActions.length === 0 || policy.hrActions.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`${policy.id} 的 hrActions 无效`);
  }
  if (!policy.verification || !["verified", "pending-review"].includes(policy.verification.status)) {
    throw new Error(`${policy.id} 的 verification.status 无效`);
  }
  if (!Array.isArray(policy.verification.sources) || policy.verification.sources.length === 0) {
    throw new Error(`${policy.id} 至少需要一个官方来源`);
  }
  for (const source of policy.verification.sources) {
    if (!source.title || !source.authority || !source.url || !source.excerpt) throw new Error(`${policy.id} 的来源字段不完整`);
    const configured = sourceIndex.get(policy.id);
    const allowedDomains = configured?.officialDomains ?? [new URL(source.url).hostname];
    assertOfficialUrl(source.url, allowedDomains);
  }
  return true;
}

export function buildSourceIndex(config) {
  return new Map(config.sources.map((source) => [source.policyId, source]));
}

export function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}
