import path from "node:path";
import process from "node:process";
import { buildSourceIndex, readJson, validatePolicy, writeJsonAtomic } from "./lib.mjs";

const requested = process.argv[2];
if (!requested) throw new Error("用法：npm run approve -- <review-queue 中的候选 JSON 文件名>");
const fileName = path.basename(requested);
if (fileName !== requested && requested !== `data/review-queue/${fileName}`) throw new Error("只允许读取 data/review-queue 内的候选文件");

const queuePath = `data/review-queue/${fileName}`;
const [record, database, sourceConfig] = await Promise.all([
  readJson(queuePath),
  readJson("data/policies.json"),
  readJson("data/sources.json")
]);

if (record.decision !== "pending-human-review") throw new Error(`候选项当前状态不是 pending-human-review：${record.decision}`);
const now = new Date().toISOString();
const policy = structuredClone(record.policy);
policy.verification.status = "verified";
policy.verification.verifiedAt = now;
policy.verification.method = "human-reviewed-after-official-evidence-and-independent-ai-audit";
validatePolicy(policy, buildSourceIndex(sourceConfig));

const policyIndex = database.policies.findIndex((item) => item.id === policy.id);
if (policyIndex < 0) throw new Error(`正式数据库中找不到政策 ${policy.id}`);
database.policies[policyIndex] = policy;
database.lastVerifiedAt = now;
record.decision = "approved-by-human";
record.approvedAt = now;
record.policy = policy;

await writeJsonAtomic("data/policies.json", database);
await writeJsonAtomic(queuePath, record);
console.log(`已批准并发布：${policy.title}`);
