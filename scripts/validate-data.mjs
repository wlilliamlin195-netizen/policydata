import { buildSourceIndex, readJson, validatePolicy } from "./lib.mjs";

const [database, config] = await Promise.all([
  readJson("data/policies.json"),
  readJson("data/sources.json"),
]);

if (database.schemaVersion !== 1) throw new Error("不支持的 policies.json schemaVersion");
if (!Array.isArray(database.policies) || database.policies.length === 0) throw new Error("政策数据库为空");

const sourceIndex = buildSourceIndex(config);
const ids = new Set();
for (const policy of database.policies) {
  if (ids.has(policy.id)) throw new Error(`重复政策 ID：${policy.id}`);
  ids.add(policy.id);
  validatePolicy(policy, sourceIndex);
}

for (const source of config.sources.filter((item) => item.enabled)) {
  if (!ids.has(source.policyId)) throw new Error(`监测源 ${source.id} 指向不存在的政策 ${source.policyId}`);
  if (!Array.isArray(source.officialDomains) || source.officialDomains.length === 0) throw new Error(`监测源 ${source.id} 缺少域名白名单`);
  if (!Array.isArray(source.urls) || source.urls.length === 0) throw new Error(`监测源 ${source.id} 缺少 URL`);
}

console.log(`数据校验通过：${database.policies.length} 项政策，${config.sources.filter((item) => item.enabled).length} 个启用监测源。`);
