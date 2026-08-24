const state = {
  policies: [],
  filtered: [],
  search: "",
  region: "ALL",
  category: "ALL",
  verifiedOnly: true,
  lastVerifiedAt: null,
  lastCheckedAt: null,
};

const monitorStateUrls = [
  "https://raw.githubusercontent.com/wlilliamlin195-netizen/policydata/main/data/monitor-state.json",
  "./data/monitor-state.json",
];

const ui = {
  list: document.querySelector("#policy-list"),
  empty: document.querySelector("#empty-state"),
  resultsCount: document.querySelector("#results-count"),
  search: document.querySelector("#search-input"),
  region: document.querySelector("#region-filter"),
  category: document.querySelector("#category-filter"),
  verified: document.querySelector("#verified-filter"),
  form: document.querySelector("#filter-form"),
  status: document.querySelector("#header-status-text"),
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Shanghai",
});

function formatDate(value) {
  if (!value) return "日期待官方确认";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatTimestamp(value) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai",
  }).format(date);
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function makeTag(text, modifier = "") {
  return makeElement("span", `tag ${modifier}`.trim(), text);
}

function buildSource(source) {
  const row = makeElement("div", "source-item");
  const meta = makeElement("div");
  const link = makeElement("a", "", source.title);
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  const authority = makeElement("p", "", source.authority);
  meta.append(link, authority);
  const quote = makeElement("blockquote", "", source.excerpt);
  row.append(meta, quote);
  return row;
}

function buildPolicyCard(policy) {
  const card = makeElement("article", "policy-card");
  card.dataset.policyId = policy.id;

  const header = makeElement("header", "policy-card-header");
  const titleArea = makeElement("div");
  const meta = makeElement("div", "policy-meta");
  meta.append(
    makeTag(policy.jurisdiction),
    makeTag(policy.category),
    makeTag(policy.impactLevel === "high" ? "高影响" : "中等影响", policy.impactLevel === "high" ? "tag-high" : "tag-medium"),
    makeTag(policy.verification.status === "verified" ? "已核验" : "待核验", policy.verification.status === "verified" ? "tag-verified" : "tag-medium"),
  );
  const title = makeElement("h3", "", policy.title);
  const subtitle = makeElement("p", "policy-subtitle", policy.topic);
  titleArea.append(meta, title, subtitle);

  const date = makeElement("div", "effective-date");
  date.append(makeElement("span", "", "生效日期"), makeElement("strong", "", formatDate(policy.effectiveDate)));
  header.append(titleArea, date);

  const comparison = makeElement("div", "comparison-grid");
  const oldPanel = makeElement("section", "rule-panel old");
  oldPanel.append(makeElement("span", "", "旧规 / BEFORE"), makeElement("p", "", policy.oldRule));
  const arrow = makeElement("div", "comparison-arrow", "→");
  arrow.setAttribute("aria-hidden", "true");
  const newPanel = makeElement("section", "rule-panel new");
  newPanel.append(makeElement("span", "", "新规 / NOW"), makeElement("p", "", policy.newRule));
  comparison.append(oldPanel, arrow, newPanel);

  const delta = makeElement("div", "delta-bar");
  delta.append(makeElement("strong", "", "核心差异"), makeElement("span", "", policy.deltaSummary));

  const actions = makeElement("section", "actions");
  actions.append(makeElement("h4", "", "HR 建议动作"));
  const actionList = makeElement("ul");
  policy.hrActions.forEach((action) => actionList.append(makeElement("li", "", action)));
  actions.append(actionList);

  const evidence = makeElement("details", "evidence");
  const summary = makeElement("summary", "");
  summary.append(makeElement("span", "", "查看官方证据与核验记录"), makeElement("span", "", `${policy.verification.sources.length} 个来源`));
  const evidenceBody = makeElement("div", "evidence-body");
  policy.verification.sources.forEach((source) => evidenceBody.append(buildSource(source)));
  evidence.append(summary, evidenceBody);

  card.append(header, comparison, delta, actions, evidence);
  return card;
}

function populateSelect(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.append(option);
  });
}

function resetSelect(select, label, selectedValue) {
  const option = document.createElement("option");
  option.value = "ALL";
  option.textContent = label;
  select.replaceChildren(option);
  select.value = selectedValue;
}

function applyFilters() {
  const query = state.search.trim().toLocaleLowerCase("zh-CN");
  state.filtered = state.policies.filter((policy) => {
    if (state.region !== "ALL" && policy.jurisdiction !== state.region) return false;
    if (state.category !== "ALL" && policy.category !== state.category) return false;
    if (state.verifiedOnly && policy.verification.status !== "verified") return false;
    if (!query) return true;
    const haystack = [
      policy.jurisdiction,
      policy.category,
      policy.title,
      policy.topic,
      policy.oldRule,
      policy.newRule,
      policy.deltaSummary,
      ...policy.hrActions,
    ].join(" ").toLocaleLowerCase("zh-CN");
    return haystack.includes(query);
  });
  renderPolicies();
}

function renderPolicies() {
  ui.list.replaceChildren();
  const fragment = document.createDocumentFragment();
  state.filtered.forEach((policy) => fragment.append(buildPolicyCard(policy)));
  ui.list.append(fragment);
  ui.empty.hidden = state.filtered.length !== 0;
  ui.resultsCount.textContent = `显示 ${state.filtered.length} / ${state.policies.length} 项`;
}

function renderMetrics() {
  const verified = state.policies.filter((item) => item.verification.status === "verified");
  document.querySelector("#metric-total").textContent = String(verified.length);
  document.querySelector("#metric-high").textContent = String(verified.filter((item) => item.impactLevel === "high").length);
  document.querySelector("#metric-regions").textContent = String(new Set(verified.map((item) => item.jurisdiction)).size);
  document.querySelector("#metric-verified").textContent = formatTimestamp(state.lastVerifiedAt);
  document.querySelector("#metric-monitored").textContent = formatTimestamp(state.lastCheckedAt);
  ui.status.textContent = state.lastCheckedAt
    ? `官网检查 · ${formatTimestamp(state.lastCheckedAt)}`
    : `内容核验 · ${formatTimestamp(state.lastVerifiedAt)}`;
}

async function loadMonitorState() {
  for (const url of monitorStateUrls) {
    try {
      const separator = url.includes("?") ? "&" : "?";
      const response = await fetch(`${url}${separator}t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const monitorState = await response.json();
      if (!monitorState.lastCheckedAt) throw new Error("缺少 lastCheckedAt");
      state.lastCheckedAt = monitorState.lastCheckedAt;
      renderMetrics();
      return;
    } catch (error) {
      console.warn(`无法从 ${url} 读取监测状态`, error);
    }
  }
  state.lastCheckedAt = null;
  renderMetrics();
}

function bindEvents() {
  let timer;
  ui.search.addEventListener("input", () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      state.search = ui.search.value;
      applyFilters();
    }, 120);
  });
  ui.region.addEventListener("change", () => { state.region = ui.region.value; applyFilters(); });
  ui.category.addEventListener("change", () => { state.category = ui.category.value; applyFilters(); });
  ui.verified.addEventListener("change", () => { state.verifiedOnly = ui.verified.checked; applyFilters(); });
  ui.form.addEventListener("reset", () => {
    window.setTimeout(() => {
      state.search = "";
      state.region = "ALL";
      state.category = "ALL";
      state.verifiedOnly = true;
      applyFilters();
    });
  });

  document.querySelectorAll(".view-tab").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      document.querySelectorAll(".view-tab").forEach((tab) => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      document.querySelector("#comparison-view").hidden = view !== "comparison";
      document.querySelector("#method-view").hidden = view !== "method";
    });
  });
}

async function loadPolicies() {
  try {
    const response = await fetch("./data/policies.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const database = await response.json();
    state.lastVerifiedAt = database.lastVerifiedAt;
    state.policies = database.policies
      .slice()
      .sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    resetSelect(ui.region, "全部法域", state.region);
    resetSelect(ui.category, "全部类型", state.category);
    populateSelect(ui.region, [...new Set(state.policies.map((item) => item.jurisdiction))].sort((a, b) => a.localeCompare(b, "zh-CN")));
    populateSelect(ui.category, [...new Set(state.policies.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "zh-CN")));
    ui.region.value = [...ui.region.options].some((option) => option.value === state.region) ? state.region : "ALL";
    ui.category.value = [...ui.category.options].some((option) => option.value === state.category) ? state.category : "ALL";
    renderMetrics();
    applyFilters();
  } catch (error) {
    ui.status.textContent = "数据加载失败";
    ui.resultsCount.textContent = "无法读取政策数据";
    const message = makeElement("div", "error-state");
    message.append(makeElement("strong", "", "政策数据加载失败"), makeElement("p", "", "请通过本项目自带的本地服务器访问，或检查 data/policies.json 是否存在。"));
    ui.list.replaceChildren(message);
    console.error(error);
  }
}

bindEvents();
loadPolicies();
loadMonitorState();

// 长时间打开页面时自动读取最新的已发布数据。
window.setInterval(() => {
  loadPolicies();
  loadMonitorState();
}, 5 * 60 * 1000);
