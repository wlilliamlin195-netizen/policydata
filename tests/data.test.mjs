import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildSourceIndex, projectRoot, readJson, validatePolicy } from "../scripts/lib.mjs";

test("政策数据库中的 ID 唯一且结构有效", async () => {
  const [database, sourceConfig] = await Promise.all([
    readJson("data/policies.json"),
    readJson("data/sources.json")
  ]);
  const ids = database.policies.map((policy) => policy.id);
  assert.equal(new Set(ids).size, ids.length);
  const sourceIndex = buildSourceIndex(sourceConfig);
  database.policies.forEach((policy) => assert.equal(validatePolicy(policy, sourceIndex), true));
});

test("所有启用监测源都指向现有政策和 HTTPS 白名单", async () => {
  const [database, sourceConfig] = await Promise.all([
    readJson("data/policies.json"),
    readJson("data/sources.json")
  ]);
  const policyIds = new Set(database.policies.map((policy) => policy.id));
  for (const source of sourceConfig.sources.filter((item) => item.enabled)) {
    assert(policyIds.has(source.policyId));
    for (const value of source.urls) {
      const url = new URL(value);
      assert.equal(url.protocol, "https:");
      assert(source.officialDomains.includes(url.hostname));
    }
  }
});

test("日本最低工资明确标注分批生效区间", async () => {
  const database = await readJson("data/policies.json");
  const policy = database.policies.find((item) => item.id === "jp-regional-minimum-wage-2025");
  assert(policy);
  assert.equal(policy.effectiveDateLabel, "分批生效");
  assert.equal(policy.effectiveDateDisplay, "2025-10-01 至 2026-03-31");
  assert.match(policy.newRule, /2025 年 10 月 1 日至 2026 年 3 月 31 日/);
  assert.equal(policy.verification.sources.length, 2);
});

test("前端包含核心筛选和对比挂载点", async () => {
  const [html, js] = await Promise.all([
    readFile(path.join(projectRoot, "index.html"), "utf8"),
    readFile(path.join(projectRoot, "app.js"), "utf8")
  ]);
  for (const id of ["policy-list", "search-input", "region-filter", "category-filter", "comparison-view", "page-title"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Policy Data Base/);
  assert.match(html, /全球新旧/);
  assert.doesNotMatch(html, /更新与核验|核验优先|id=["']method-view["']/);
  assert.match(js, /textContent/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
});
