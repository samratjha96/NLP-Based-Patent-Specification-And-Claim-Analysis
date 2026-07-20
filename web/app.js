const tools = {
  "family-history": {
    index: "01",
    title: "Claim amendment history",
    shortTitle: "Amendment history",
    category: "Patent review",
    mode: "prototype",
    runtime: "Prosecution timeline",
    description: "Resolve a U.S. patent family and review how independent claim language changed from filing through allowance.",
    guidance: "Enter a U.S. patent or application number to review prosecution events across the related U.S. family.",
    contextTitle: "Read scope movement in sequence",
    contextCopy: "An amendment is evidence of prosecution history, not a standalone claim-construction conclusion. Review the cited office action and applicant response together.",
    steps: ["Resolve family", "Retrieve histories", "Compare claim text", "Render timeline"],
    explanation: "Starting from one U.S. patent or application, this review follows related family members, places prosecution events in sequence, and compares how independent claim language changed over time.",
    fields: "identifier"
  },
  "family-claims": {
    index: "02",
    title: "Compare U.S. family claims",
    shortTitle: "Compare family claims",
    category: "Patent review",
    mode: "prototype",
    runtime: "Family scope comparison",
    description: "Line up granted independent claims across a U.S. family and isolate the limitations that changed portfolio scope.",
    guidance: "Start with one U.S. application or patent number to align independent claims from granted family members.",
    contextTitle: "Compare language before summaries",
    contextCopy: "The aligned claim text is the primary evidence. The generated difference summary is a navigation aid and should be checked against each patent.",
    steps: ["Resolve grants", "Collect claims", "Align language", "Summarize differences"],
    explanation: "This review identifies granted U.S. family members, aligns their latest independent claims, highlights added or changed limitations, and summarizes the principal differences in scope.",
    fields: "identifier"
  },
  unclaimed: {
    index: "03",
    title: "Unclaimed subject matter",
    shortTitle: "Unclaimed subject matter",
    category: "Patent review",
    mode: "prototype",
    runtime: "Coverage review",
    description: "Surface specification concepts that appear weakly covered or absent across related U.S. claims.",
    guidance: "Provide a family seed to compare disclosed concepts with claims across the related U.S. family.",
    contextTitle: "A coverage lead, not a legal opinion",
    contextCopy: "A weak textual match can identify review candidates, but claim coverage depends on construction, equivalents, and the complete record.",
    steps: ["Load specification", "Extract concepts", "Collect family claims", "Score coverage"],
    explanation: "This review identifies disclosed concepts, compares them with claim language across the U.S. family, and surfaces areas that may warrant a closer coverage review.",
    fields: "identifier"
  },
  support: {
    index: "04",
    title: "Specification support",
    shortTitle: "Specification support",
    category: "Drafting review",
    mode: "live",
    runtime: "Specification evidence search",
    description: "Find the passages most likely to support a limitation across the complete specification.",
    guidance: "The loaded USPTO specification is searched directly. Add every limitation you want to investigate in the same review.",
    contextTitle: "Ranked passages are starting points",
    contextCopy: "A high score means the passage is textually relevant, not necessarily that it satisfies written-description or enablement requirements. Read the full paragraph and surrounding disclosure.",
    steps: ["Validate input", "Build document index", "Search limitations", "Rank evidence"],
    explanation: "This review breaks the specification into passages, ranks the passages most relevant to each limitation, and preserves paragraph and sentence locations so the cited disclosure can be checked in context.",
    fields: "support"
  },
  antecedent: {
    index: "05",
    title: "Antecedent basis review",
    shortTitle: "Antecedent basis",
    category: "Drafting review",
    mode: "live",
    runtime: "Claim-language review",
    description: "Track introduced claim terms and later references to flag likely missing antecedent basis and unused introductions.",
    guidance: "The claims from the loaded USPTO record are reviewed directly so the attorney can confirm likely issues in context.",
    contextTitle: "Drafting heuristic, not claim construction",
    contextCopy: "The checker follows noun-phrase introductions and references. It can miss implicit antecedents and may flag deliberate drafting choices.",
    steps: ["Parse claim text", "Track introductions", "Match references", "Rank issues"],
    explanation: "This review tracks when claim terms are introduced and how later references use them. It flags definite references without a likely earlier introduction and separately notes introduced terms that are never reused.",
    fields: "claim"
  },
  linguistic: {
    index: "06",
    title: "Linguistic claim analysis",
    shortTitle: "Claim structure",
    category: "Drafting review",
    mode: "live",
    runtime: "Claim structure map",
    description: "Turn dense claim language into an inspectable map of actions, objects, details, alternatives, and dependencies.",
    guidance: "The claims from the loaded USPTO record are mapped with their original punctuation and transitional phrases.",
    contextTitle: "Structure is easier to review when visible",
    contextCopy: "The diagram exposes linguistic relationships. It does not decide whether a limitation is definite, enabled, or patentable.",
    steps: ["Parse syntax", "Segment limitations", "Classify relationships", "Render diagram"],
    explanation: "This review separates the claim into limitations, then maps the actions, objects, details, alternatives, and dependencies so dense language can be inspected more easily.",
    fields: "claim"
  },
  "art-unit": {
    index: "07",
    title: "Art unit predictor",
    shortTitle: "Art unit predictor",
    category: "Drafting review",
    mode: "prototype",
    runtime: "Routing estimate",
    description: "Rank the five most likely USPTO art units from invention text, then connect the estimate to examiner analytics.",
    guidance: "The loaded specification and claims provide the technical language used for the routing estimate.",
    contextTitle: "Routing estimates are directional",
    contextCopy: "Art unit assignment depends on classification practice and incoming workload. Treat ranked estimates as a planning signal, not a filing outcome.",
    steps: ["Review invention text", "Identify technical focus", "Rank art units", "Connect relevant trends"],
    explanation: "This review uses the invention description to rank likely USPTO art units and connect the leading candidates with the prosecution trends most useful for planning.",
    fields: "invention"
  },
  examiner: {
    index: "08",
    title: "Examiner analytics",
    shortTitle: "Examiner analytics",
    category: "Examiner research",
    mode: "prototype",
    runtime: "Examiner trends",
    description: "Move from raw prosecution records to an examiner, art unit, work group, or technology-center strategy view.",
    guidance: "Search by examiner name, art unit, work group, or technology center. Example results use clearly identified illustrative prosecution data.",
    contextTitle: "Descriptive data needs context",
    contextCopy: "Observed grant ratios and rejection patterns describe past records. They do not predict a specific application or account for case mix by themselves.",
    steps: ["Resolve entity", "Aggregate records", "Calculate trends", "Render analytics"],
    explanation: "This review summarizes historical prosecution records into grant, office-action, rejection, and pendency trends for an examiner or organizational unit.",
    fields: "examiner"
  }
};

const demoToolOrder = ["family-history", "family-claims", "unclaimed", "support", "antecedent", "linguistic", "art-unit", "examiner"];
let activeToolKey = null;
let lastResultSummary = "";
let toastTimer = null;
let loadedMatter = null;
const demoRecord = window.PatentAgilityDemoRecord;

const overviewView = document.getElementById("overview-view");
const toolView = document.getElementById("tool-view");
const toolGrid = document.getElementById("tool-grid");
const sidebar = document.getElementById("sidebar");
const toolForm = document.getElementById("tool-form");
const dynamicFields = document.getElementById("dynamic-fields");
const progressPanel = document.getElementById("progress-panel");
const resultsPanel = document.getElementById("results-panel");
const resultsContent = document.getElementById("results-content");

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toolModeLabel(tool) {
  if (loadedMatter?.is_demo) return "Example";
  return tool.mode === "live" ? "Available" : "Preview";
}

function renderToolGrid() {
  toolGrid.innerHTML = demoToolOrder.map((key) => {
    const tool = tools[key];
    return `
      <button class="tool-card" type="button" data-tool="${key}" data-index="${tool.index}">
        <span class="tool-card-top"><span class="tool-card-index">${tool.index} / ${escapeHtml(tool.category)}</span><span class="tool-mode ${tool.mode === "prototype" ? "prototype" : ""}">${toolModeLabel(tool)}</span></span>
        <h3>${escapeHtml(tool.shortTitle)}</h3>
        <p>${escapeHtml(tool.description)}</p>
        <span class="tool-card-foot"><span>Open workflow</span><span aria-hidden="true">↗</span></span>
      </button>`;
  }).join("");
}

function setActiveNavigation(toolKey) {
  document.querySelectorAll("[data-tool], [data-view]").forEach((element) => element.classList.remove("is-active"));
  if (toolKey) {
    document.querySelectorAll(`[data-tool="${toolKey}"]`).forEach((element) => element.classList.add("is-active"));
  } else {
    document.querySelectorAll('[data-view="overview"]').forEach((element) => element.classList.add("is-active"));
  }
}

function showOverview() {
  activeToolKey = null;
  overviewView.classList.remove("hidden");
  toolView.classList.add("hidden");
  sidebar.classList.remove("is-open");
  setActiveNavigation(null);
  history.replaceState(null, "", "#overview");
  window.scrollTo({ top: 0, behavior: "auto" });
  document.getElementById("main-content").focus();
}

function openTool(toolKey) {
  const tool = tools[toolKey];
  if (!tool) return;
  activeToolKey = toolKey;
  overviewView.classList.add("hidden");
  toolView.classList.remove("hidden");
  sidebar.classList.remove("is-open");
  setActiveNavigation(toolKey);
  document.getElementById("breadcrumb-name").textContent = tool.shortTitle;
  document.getElementById("tool-index").textContent = tool.index;
  document.getElementById("tool-title").textContent = tool.title;
  document.getElementById("tool-description").textContent = tool.description;
  document.getElementById("tool-runtime").textContent = tool.runtime;
  document.getElementById("form-guidance").textContent = tool.guidance;
  document.getElementById("context-title").textContent = tool.contextTitle;
  document.getElementById("context-copy").textContent = tool.contextCopy;
  const sampleButton = document.getElementById("load-sample");
  const usesRecordText = ["claim", "support", "invention"].includes(tool.fields);
  sampleButton.hidden = usesRecordText || Boolean(loadedMatter);
  sampleButton.textContent = "Use example";
  document.getElementById("input-assurance-copy").innerHTML = loadedMatter?.is_demo
    ? "<strong>Illustrative example.</strong> The built-in record is synthetic and exists only to demonstrate the review workflow."
    : "<strong>Public record source.</strong> Confirm all material passages and bibliographic data against the official file before relying on them.";
  const modeBadge = document.getElementById("mode-badge");
  modeBadge.textContent = toolModeLabel(tool);
  modeBadge.classList.toggle("prototype", tool.mode === "prototype");
  renderFields(tool);
  progressPanel.classList.add("hidden");
  resultsPanel.classList.add("hidden");
  resultsContent.innerHTML = "";
  history.replaceState(null, "", `#${toolKey}`);
  window.scrollTo({ top: 0, behavior: "auto" });
  document.getElementById("main-content").focus();
}

function field(label, control, hint = "") {
  return `<div class="field"><label>${label}</label>${control}${hint ? `<div class="field-hint">${hint}</div>` : ""}</div>`;
}

function identifierFields() {
  if (loadedMatter?.is_demo) return matterSourceField("Patent record");
  const identifier = loadedMatter ? (loadedMatter.application_number || loadedMatter.patent_number) : "";
  const identifierType = loadedMatter && loadedMatter.application_number ? "application" : "patent";
  const identifierHint = loadedMatter ? "The loaded patent number is filled automatically. Punctuation is optional." : "Punctuation is optional.";
  return `<div class="field-grid">
    ${field("Identifier type", `<select id="id-type" name="idType" aria-label="Identifier type"><option value="application" ${identifierType === "application" ? "selected" : ""}>Application number</option><option value="patent" ${identifierType === "patent" ? "selected" : ""}>Patent number</option></select>`)}
    ${field("U.S. identifier", `<input id="identifier" name="identifier" inputmode="numeric" autocomplete="off" aria-label="U.S. identifier" placeholder="18/456,219" value="${escapeHtml(identifier)}" required>`, identifierHint)}
  </div>`;
}

function matterSourceField(section) {
  if (!loadedMatter) {
    return `<div class="matter-source empty"><span>No patent record loaded</span><strong>Open a U.S. patent or application from Overview.</strong></div>`;
  }
  const isTextSection = section === "Specification" || section === "Claims";
  const count = section === "Specification" ? loadedMatter.specification_character_count : loadedMatter.claims_character_count;
  const detail = isTextSection
    ? (count ? `${count.toLocaleString()} characters ready` : `${section} text was not found in the retrieved document`)
    : (loadedMatter.display_identifier || loadedMatter.source);
  const sourceLabel = loadedMatter.is_demo ? "example patent" : "loaded patent";
  const sourceDetail = loadedMatter.is_demo ? "Illustrative example · Used automatically" : "Used automatically for this review";
  return `<div class="matter-source ${loadedMatter.is_demo ? "demo" : ""}"><span>${escapeHtml(section)} from ${sourceLabel}</span><strong>${escapeHtml(loadedMatter.title || `Application ${loadedMatter.application_number}`)}</strong><small>${escapeHtml(detail)} · ${sourceDetail}</small></div>`;
}

function claimField() {
  return matterSourceField("Claims");
}

function supportFields() {
  return `
    ${matterSourceField("Specification")}
    <div class="field">
      <label><span>Limitations or concepts</span><small>Up to 64 per request</small></label>
      <div class="query-list" id="query-list"></div>
      <button class="add-query" id="add-query" type="button">+ Add another limitation</button>
    </div>
    ${field("Results per limitation", `<select id="top-n" name="topN" aria-label="Results per limitation"><option value="3">3 passages</option><option value="5" selected>5 passages</option><option value="10">10 passages</option></select>`)}
  `;
}

function renderFields(tool) {
  if (tool.fields === "identifier") dynamicFields.innerHTML = identifierFields();
  if (tool.fields === "claim") dynamicFields.innerHTML = claimField();
  if (tool.fields === "support") dynamicFields.innerHTML = supportFields();
  if (tool.fields === "invention") {
    dynamicFields.innerHTML = matterSourceField("Specification");
  }
  if (tool.fields === "examiner") {
    const value = loadedMatter?.is_demo ? loadedMatter.review_examples.examiner_query : "";
    dynamicFields.innerHTML = `${loadedMatter?.is_demo ? matterSourceField("Analytics cohort") : ""}${field("Examiner, art unit, work group, or tech center", `<input id="examiner-query" name="examinerQuery" type="search" aria-label="Examiner, art unit, work group, or tech center" placeholder="Try: Art Unit 2123" value="${escapeHtml(value)}" required>`, "Search results can be narrowed by name or USPTO organizational unit.")}`;
  }
  attachFieldBehavior(tool);
}

function attachFieldBehavior(tool) {
  if (tool.fields === "support") {
    const queries = loadedMatter?.is_demo ? loadedMatter.review_examples.support_queries : [""];
    queries.forEach((query) => addQueryRow(query));
    if (loadedMatter?.is_demo) document.getElementById("top-n").value = "3";
    document.getElementById("add-query").addEventListener("click", () => addQueryRow(""));
  }
}

function addQueryRow(value) {
  const queryList = document.getElementById("query-list");
  if (!queryList || queryList.children.length >= 64) return;
  const row = document.createElement("div");
  row.className = "query-row";
  row.innerHTML = `<span>${String(queryList.children.length + 1).padStart(2, "0")}</span><input class="query-input" type="text" value="${escapeHtml(value)}" placeholder="Enter a claim limitation or concept" required><button type="button" aria-label="Remove limitation">×</button>`;
  row.querySelector("button").addEventListener("click", () => {
    if (queryList.children.length === 1) {
      row.querySelector("input").value = "";
      return;
    }
    row.remove();
    [...queryList.children].forEach((item, index) => item.querySelector("span").textContent = String(index + 1).padStart(2, "0"));
  });
  queryList.append(row);
}

function loadSample() {
  const tool = tools[activeToolKey];
  if (!tool) return;
  const toolKey = activeToolKey;
  loadDemoPatent();
  openTool(toolKey);
}

function collectPayload(tool) {
  if (tool.mode === "prototype" && !loadedMatter?.is_demo) {
    throw new Error("Open the built-in example patent to explore this illustrative workflow.");
  }
  if (tool.fields === "identifier") {
    if (loadedMatter?.is_demo) {
      return { idType: "example", identifier: loadedMatter.display_identifier };
    }
    const identifier = document.getElementById("identifier").value.replace(/\D/g, "");
    if (!identifier) throw new Error("Enter a U.S. patent or application number.");
    return { idType: document.getElementById("id-type").value, identifier };
  }
  if (tool.fields === "claim") {
    if (!loadedMatter) throw new Error("Open a patent record before running this analysis.");
    if (!loadedMatter.claims_character_count) throw new Error("No claims text was found in the retrieved specification.");
    if (loadedMatter.is_demo) return { claim_text: loadedMatter.claims_text };
    return { record_id: loadedMatter.record_id };
  }
  if (tool.fields === "support") {
    const queries = [...document.querySelectorAll(".query-input")].map((input) => input.value.trim()).filter(Boolean);
    if (!loadedMatter) throw new Error("Open a patent record before running this search.");
    if (!loadedMatter.specification_character_count) throw new Error("No specification text was found in the retrieved record.");
    if (!queries.length) throw new Error("Add at least one limitation or concept.");
    if (loadedMatter.is_demo) {
      return { patent_text: loadedMatter.specification_text, queries, top_n: Number(document.getElementById("top-n").value) };
    }
    return { record_id: loadedMatter.record_id, queries, top_n: Number(document.getElementById("top-n").value) };
  }
  if (tool.fields === "invention") {
    if (!loadedMatter) throw new Error("Open a patent record before predicting an art unit.");
    if (loadedMatter.is_demo) return { inventionText: loadedMatter.abstract };
    return { recordId: loadedMatter.record_id };
  }
  const examinerQuery = document.getElementById("examiner-query").value.trim();
  if (!examinerQuery) throw new Error("Enter an examiner, art unit, work group, or technology center.");
  return { examinerQuery };
}

async function runAnalysis(event) {
  event.preventDefault();
  const tool = tools[activeToolKey];
  if (!tool) return;
  let payload;
  try {
    payload = collectPayload(tool);
  } catch (error) {
    showToast(error.message);
    return;
  }

  const runButton = document.getElementById("run-analysis");
  runButton.disabled = true;
  resultsPanel.classList.add("hidden");
  startProgress(tool);
  try {
    const resultPromise = executeTool(activeToolKey, payload);
    await animateProgress(tool, resultPromise);
    const result = await resultPromise;
    renderResult(activeToolKey, result, payload);
  } catch (error) {
    renderError(error);
  } finally {
    runButton.disabled = false;
  }
}

function startProgress(tool) {
  progressPanel.classList.remove("hidden");
  document.getElementById("progress-title").textContent = tool.steps[0];
  document.getElementById("progress-percent").textContent = "5%";
  document.getElementById("progress-fill").style.width = "5%";
  document.getElementById("progress-steps").innerHTML = tool.steps.map((step, index) => `<li class="${index === 0 ? "active" : ""}">${String(index + 1).padStart(2, "0")} · ${escapeHtml(step)}</li>`).join("");
}

async function animateProgress(tool, resultPromise) {
  const checkpoints = [22, 48, 72];
  for (let index = 0; index < checkpoints.length; index += 1) {
    await Promise.race([resultPromise.then(() => null).catch(() => null), new Promise((resolve) => setTimeout(resolve, tool.mode === "live" ? 360 : 220))]);
    const items = [...document.querySelectorAll("#progress-steps li")];
    items.forEach((item, itemIndex) => {
      item.classList.toggle("done", itemIndex < index + 1);
      item.classList.toggle("active", itemIndex === index + 1);
    });
    document.getElementById("progress-title").textContent = tool.steps[Math.min(index + 1, tool.steps.length - 1)];
    document.getElementById("progress-percent").textContent = `${checkpoints[index]}%`;
    document.getElementById("progress-fill").style.width = `${checkpoints[index]}%`;
  }
  await resultPromise;
  document.querySelectorAll("#progress-steps li").forEach((item) => { item.classList.add("done"); item.classList.remove("active"); });
  document.getElementById("progress-title").textContent = "Analysis complete";
  document.getElementById("progress-percent").textContent = "100%";
  document.getElementById("progress-fill").style.width = "100%";
}

async function requestJson(url, payload) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() },
      body: JSON.stringify(payload)
    });
  } catch (cause) {
    const error = new Error(PatentAgilityErrors.networkErrorMessage(), { cause });
    error.kind = "network";
    throw error;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(PatentAgilityErrors.apiErrorMessage(response.status, data));
    error.status = response.status;
    error.retryAfter = response.headers.get("Retry-After");
    throw error;
  }
  return data;
}

function formatApplicationNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : (digits || "—");
}

function formatPatentNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("en-US") : "—";
}

function renderLoadedMatter() {
  if (!loadedMatter) return;
  const title = loadedMatter.title || `Application ${formatApplicationNumber(loadedMatter.application_number)}`;
  const application = loadedMatter.is_demo ? "Illustrative" : formatApplicationNumber(loadedMatter.application_number);
  const patent = loadedMatter.is_demo ? "Illustrative" : formatPatentNumber(loadedMatter.patent_number);
  document.getElementById("matter-name").textContent = title;
  document.getElementById("matter-meta").textContent = loadedMatter.is_demo
    ? `${loadedMatter.display_identifier} · Illustrative data`
    : `US ${application} · ${loadedMatter.status || "Public record"}`;
  document.getElementById("record-status").textContent = loadedMatter.is_demo ? "Example" : "Loaded";
  document.getElementById("record-title").textContent = title;
  document.getElementById("record-application").textContent = application;
  document.getElementById("record-patent").textContent = patent;
  document.getElementById("record-case-status").textContent = loadedMatter.status || "—";
  document.getElementById("record-summary").classList.remove("hidden");
  document.getElementById("context-application").textContent = application;
  document.getElementById("context-patent").textContent = patent;
  document.getElementById("context-status").textContent = loadedMatter.status || "—";
  document.getElementById("context-source").textContent = loadedMatter.is_demo ? "Illustrative dataset" : loadedMatter.source;
  document.getElementById("source-assurance-title").textContent = loadedMatter.is_demo ? "Illustrative example" : "Official source";
  document.getElementById("source-assurance-copy").textContent = loadedMatter.is_demo ? "The example uses a built-in synthetic dossier and makes no USPTO request." : "Records are retrieved from the USPTO Open Data Portal.";
  renderToolGrid();
}

function loadDemoPatent() {
  loadedMatter = demoRecord;
  renderLoadedMatter();
  const message = document.getElementById("lookup-message");
  message.textContent = "Example patent loaded. Every review workflow is ready to explore.";
  message.className = "lookup-message is-success";
  showToast("Example patent loaded.");
}

async function lookupPatent(event) {
  event.preventDefault();
  const identifierType = document.getElementById("lookup-identifier-type").value;
  const identifier = document.getElementById("lookup-identifier").value.trim();
  const submit = document.getElementById("lookup-submit");
  const message = document.getElementById("lookup-message");
  const validationMessage = PatentAgilityErrors.validatePatentIdentifier(identifierType, identifier);
  if (validationMessage) {
    message.textContent = validationMessage;
    message.className = "lookup-message is-error";
    document.getElementById("lookup-identifier").focus();
    return;
  }
  submit.disabled = true;
  submit.textContent = "Opening…";
  message.textContent = "Retrieving the official file and preparing its specification and claims.";
  message.className = "lookup-message is-working";
  try {
    loadedMatter = await requestJson("/v1/patents/lookup", {
      identifier_type: identifierType,
      identifier
    });
    renderLoadedMatter();
    message.textContent = "Official record loaded. Choose a review task below.";
    message.className = "lookup-message is-success";
    showToast("USPTO record loaded.");
  } catch (error) {
    message.textContent = error.message;
    message.className = "lookup-message is-error";
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Open";
  }
}

function executeTool(toolKey, payload) {
  if (loadedMatter?.is_demo && loadedMatter.demo_results?.[toolKey]) {
    return new Promise((resolve) => setTimeout(() => resolve(loadedMatter.demo_results[toolKey]), 260));
  }
  if (toolKey === "support") return requestJson("/v1/support/search", payload);
  if (toolKey === "antecedent") return requestJson("/v1/claims/antecedent", payload);
  if (toolKey === "linguistic") return requestJson("/v1/claims/diagram", payload);
  return new Promise((resolve) => setTimeout(() => resolve({ prototype: true }), 850));
}

function renderResult(toolKey, result, payload) {
  progressPanel.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
  if (toolKey === "support") renderSupport(result);
  if (toolKey === "antecedent") renderAntecedent(result);
  if (toolKey === "linguistic") renderDiagrams(result);
  if (toolKey === "examiner") renderExaminer(payload);
  if (toolKey === "family-history") renderFamilyHistory(payload);
  if (toolKey === "family-claims") renderFamilyClaims(payload);
  if (toolKey === "unclaimed") renderUnclaimed(payload);
  if (toolKey === "art-unit") renderArtUnit(payload);
  lastResultSummary = `${document.getElementById("results-title").innerText}\n${document.getElementById("results-summary").innerText}\n\n${resultsContent.innerText}`;
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setResultHeading(title, summary) {
  document.getElementById("results-title").textContent = title;
  document.getElementById("results-summary").textContent = summary;
  lastResultSummary = `${title}. ${summary}`;
}

function stat(label, value) {
  return `<div class="summary-stat"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function renderSupport(result) {
  const resultGroups = Array.isArray(result.results) ? result.results : [];
  const hitCount = resultGroups.reduce((total, group) => total + (group.hits || []).length, 0);
  setResultHeading("Specification evidence", `${hitCount} ranked passages across ${resultGroups.length} limitation${resultGroups.length === 1 ? "" : "s"}. Scores indicate retrieval similarity, not a legal support conclusion.`);
  const groups = resultGroups.map((group, groupIndex) => `
    <section class="evidence-group">
      <div class="section-heading compact"><div><div class="eyebrow">Limitation ${String(groupIndex + 1).padStart(2, "0")}</div><h2>${escapeHtml(group.query)}</h2></div></div>
      <div class="evidence-list">${(group.hits || []).map((hit, index) => {
        const score = Number(hit.score || 0);
        const displayScore = score <= 1 ? Math.max(0, Math.min(100, score * 100)) : 100;
        return `<article class="evidence-hit"><div class="hit-rank">${String(index + 1).padStart(2, "0")}</div><div><h3>Paragraph ${Number(hit.paragraph_id) + 1}, sentence ${Number(hit.sentence_id) + 1}</h3><p>${escapeHtml(hit.sentence)}</p></div><footer>Similarity ${score.toFixed(3)}<div class="score-bar"><span style="width:${displayScore}%"></span></div></footer></article>`;
      }).join("")}</div>
    </section>`).join("");
  resultsContent.innerHTML = `<div class="summary-band">${stat("Review method", "Ranked evidence")}${stat("Limitations", resultGroups.length)}${stat("Passages", hitCount)}${stat("Decision", "Attorney review")}</div>${groups || '<div class="error-box"><strong>No passages returned</strong><p>Confirm that the specification contains readable sentences.</p></div>'}`;
}

function highlightedClaim(text, issues) {
  const sorted = [...issues].sort((a, b) => a.start - b.start || b.end - a.end);
  let cursor = 0;
  let output = "";
  for (const issue of sorted) {
    if (issue.start < cursor) continue;
    output += escapeHtml(text.slice(cursor, issue.start));
    output += `<mark class="${issue.severity}">${escapeHtml(text.slice(issue.start, issue.end))}</mark>`;
    cursor = issue.end;
  }
  return output + escapeHtml(text.slice(cursor));
}

function renderAntecedent(result) {
  const issues = result.issues || [];
  const high = result.summary?.high || 0;
  const info = result.summary?.info || 0;
  setResultHeading("Antecedent basis review", high ? `${high} likely missing antecedent${high === 1 ? " requires" : "s require"} attorney review. Informational flags identify terms introduced but not reused.` : "No likely missing antecedent basis was identified by the heuristic review.");
  const cards = issues.map((issue, index) => `<article class="issue-card ${issue.severity === "info" ? "info" : ""}"><div class="issue-card-top"><span>${escapeHtml(issue.severity === "high" ? "Needs review" : "Information")}</span><span>Finding ${String(index + 1).padStart(2, "0")}</span></div><h3>${escapeHtml(issue.title)}</h3><p>“${escapeHtml(issue.text)}” does not have a likely earlier introduction. Confirm whether the intended term is “the communications interface” or introduce a transmitter expressly.</p></article>`).join("");
  resultsContent.innerHTML = `<div class="summary-band">${stat("High", high)}${stat("Information", info)}${stat("Mentions tracked", (result.mentions || []).length)}${stat("Review state", high ? "Attention" : "Clear")}</div><div class="issue-layout"><div class="claim-paper">${highlightedClaim(result.claim_text || "", issues)}</div><div class="issue-list">${cards || '<article class="issue-card info"><h3>No flagged references</h3><p>The heuristic found no definite noun phrase without an earlier introduction.</p></article>'}</div></div>`;
}

function renderDiagrams(result) {
  const segments = result.segments || [];
  const frames = result.frames || [];
  const demoScope = loadedMatter?.is_demo && result.reviewed;
  setResultHeading("Claim structure", demoScope ? `${segments.length} reviewed segments from the principal limitations of example claim 1. The complete claim remains visible in the dossier.` : `${segments.length} linguistic segment${segments.length === 1 ? "" : "s"} extracted from the submitted claim. Inspect the action, object, and detail relationships before revising the draft.`);
  const rows = segments.map((segment, index) => {
    const frame = frames[index] || {};
    const leaves = frame.leaves || [];
    const alternatives = frame.or_alternatives || [];
    return `<article class="structure-row">
      <div class="structure-segment"><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(segment.kind || "limitation")}</span><p>${escapeHtml(segment.text)}</p></div>
      <div class="structure-flow" aria-hidden="true">→</div>
      <div class="frame-nodes">
        <div class="frame-node action"><small>Action</small><strong>${escapeHtml(frame.anchor_verb || "Not isolated")}</strong></div>
        <div class="frame-node object"><small>Object</small><strong>${escapeHtml(frame.object_np || "Contextual")}</strong></div>
        ${leaves.map((leaf) => `<div class="frame-node detail"><small>${escapeHtml(leaf.label || "Detail")}</small><strong>${escapeHtml(leaf.text)}</strong></div>`).join("")}
        ${alternatives.map((alternative) => `<div class="frame-node alternative"><small>Alternative</small><strong>${escapeHtml(alternative)}</strong></div>`).join("")}
      </div>
    </article>`;
  }).join("");
  resultsContent.innerHTML = `<div class="summary-band">${stat("Segments", segments.length)}${stat("Review scope", demoScope ? "Claim 1 excerpt" : "Claim text")}${stat("Output", "Structure map")}${stat("Decision", "Attorney review")}</div><div class="structure-map">${rows || '<div class="error-box"><strong>No structure generated</strong><p>Try preserving claim punctuation and transitional phrases.</p></div>'}</div>`;
}

function renderExaminer(payload) {
  const cohort = payload.examinerQuery || "Art Unit 2123";
  setResultHeading(`${cohort} analytics`, `Illustrative prosecution trends for ${cohort}, covering disposed applications from 2016 through 2024.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Observed grants", "71.4%")} ${stat("Avg. office actions", "2.6")} ${stat("Disposed applications", "18,420")} ${stat("Observation window", "2016–2024")}</div><div class="chart-grid"><article class="chart-card"><h3>Observed grant timeline</h3><p>Share of disposed applications with an observed patent grant, by disposal year.</p><svg class="line-chart" viewBox="0 0 700 260" role="img" aria-labelledby="grant-chart-title grant-chart-desc"><title id="grant-chart-title">Illustrative observed grant rate by disposal year</title><desc id="grant-chart-desc">The annual rate rises from 57.1 percent in 2016 to 74.3 percent in 2024. The aggregate observed grant rate for the full cohort is 71.4 percent.</desc><line class="grid" x1="70" y1="40" x2="650" y2="40"/><line class="grid" x1="70" y1="110" x2="650" y2="110"/><line class="grid" x1="70" y1="180" x2="650" y2="180"/><text x="32" y="44">80%</text><text x="32" y="114">65%</text><text x="32" y="184">50%</text><path class="area" d="M70,147 L142,129 L214,137 L286,107 L358,97 L430,84 L502,91 L574,73 L646,66 L646,180 L70,180 Z"/><path class="line" d="M70,147 L142,129 L214,137 L286,107 L358,97 L430,84 L502,91 L574,73 L646,66"/><g><circle cx="70" cy="147" r="5"/><title>2016: 57.1%</title></g><g><circle cx="142" cy="129" r="5"/><title>2017: 60.9%</title></g><g><circle cx="214" cy="137" r="5"/><title>2018: 59.2%</title></g><g><circle cx="286" cy="107" r="5"/><title>2019: 65.6%</title></g><g><circle cx="358" cy="97" r="5"/><title>2020: 67.8%</title></g><g><circle cx="430" cy="84" r="5"/><title>2021: 70.5%</title></g><g><circle cx="502" cy="91" r="5"/><title>2022: 69.1%</title></g><g><circle cx="574" cy="73" r="5"/><title>2023: 72.8%</title></g><g><circle cx="646" cy="66" r="5"/><title>2024: 74.3%</title></g><text class="axis-label" x="70" y="211" text-anchor="middle">2016</text><text class="axis-label" x="142" y="211" text-anchor="middle">2017</text><text class="axis-label" x="214" y="211" text-anchor="middle">2018</text><text class="axis-label" x="286" y="211" text-anchor="middle">2019</text><text class="axis-label" x="358" y="211" text-anchor="middle">2020</text><text class="axis-label" x="430" y="211" text-anchor="middle">2021</text><text class="axis-label" x="502" y="211" text-anchor="middle">2022</text><text class="axis-label" x="574" y="211" text-anchor="middle">2023</text><text class="axis-label" x="646" y="211" text-anchor="middle">2024</text></svg><p class="chart-source">Illustrative cohort · 18,420 disposed applications · data through Dec. 2024</p></article><div class="metric-stack"><div><small>First-action §101</small><strong>18.2%</strong><p>3,352 of 18,420 observed applications received a first-action eligibility rejection.</p></div><div><small>First-action §103</small><strong>63.7%</strong><p>11,734 applications received a first-action obviousness rejection.</p></div><div><small>Median pendency</small><strong>31 mo.</strong><p>From filing to abandonment or observed grant in the illustrative cohort.</p></div></div></div>`;
}

function renderFamilyHistory(payload) {
  setResultHeading("U.S. family prosecution timeline", `Illustrative claim-history review for ${payload.identifier}. The example traces one limitation from filing through allowance.`);
  const events = [
    ["Mar 2022", "Filed", "Independent claim 1 filed with sensor, controller, and alert limitations."],
    ["Nov 2023", "Non-final rejection", "§103 rejection over distributed monitoring references."],
    ["Feb 2024", "Amendment", "Added temperature compensation based on a stored calibration coefficient."],
    ["Sep 2024", "Final rejection", "Examiner maintained the combination and raised §112 clarity concerns."],
    ["Jan 2025", "Notice of allowance", "Clarified sensor-specific coefficient and offline measurement buffer."],
  ];
  resultsContent.innerHTML = `<div class="summary-band">${stat("Family members", "3")} ${stat("Events shown", events.length)} ${stat("Claims traced", "1")} ${stat("Data", "Illustrative")}</div><article class="timeline-card"><h3>Claim 1 · Scope movement</h3><div class="timeline"><div class="timeline-events">${events.map((event, index) => `<div class="timeline-event ${index === events.length - 1 ? "allowance" : ""}"><small>${event[0]}</small><div class="timeline-dot"></div><strong>${event[1]}</strong><p>${event[2]}</p></div>`).join("")}</div></div></article><article class="amendment-detail"><div><small>Filed limitation</small><p>“determine a vibration value from the measurement signal”</p></div><div><small>Allowed limitation</small><p>“determine a compensated vibration value by applying a sensor-specific temperature coefficient to the measurement signal”</p></div><p><strong>Scope movement:</strong> the allowed claim narrows the calculation to temperature compensation using calibration data associated with the individual sensor.</p></article>`;
}

function renderFamilyClaims(payload) {
  setResultHeading("Granted family claim comparison", `Three illustrative independent claims aligned for ${payload.identifier}. Highlighting distinguishes additions from changed emphasis.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Family members shown", "3")} ${stat("Claims aligned", "3")} ${stat("Shared core", "Sensor + controller")} ${stat("Data", "Illustrative")}</div><div class="comparison-legend"><span class="legend-add">Added limitation</span><span class="legend-change">Changed emphasis</span></div><div class="claim-comparison"><div class="claim-columns"><article class="claim-column"><header><strong>Example parent</strong><small>DS-101 · Claim 1</small></header><p>A sensing system comprising an optical sensing probe configured to generate a measurement signal and a controller configured to determine a compensated value <span class="diff-add">using a calibration coefficient stored for the probe</span>.</p></article><article class="claim-column"><header><strong>Continuation A</strong><small>DS-101-A · Claim 1</small></header><p>A distributed sensing system comprising <span class="diff-change">a plurality of mesh-connected optical sensing probes</span> and a controller configured to determine compensated vibration values according to ambient temperature.</p></article><article class="claim-column"><header><strong>Continuation B</strong><small>DS-101-B · Claim 8</small></header><p>A method comprising receiving a measurement signal, applying temperature compensation, and <span class="diff-add">storing timestamped measurements locally while network connectivity is unavailable</span>.</p></article></div></div><article class="comparison-summary"><h3>Difference summary</h3><p>The example parent emphasizes probe-specific calibration. Continuation A shifts toward distributed mesh topology. Continuation B isolates offline buffering and ordered retransmission as a method claim.</p></article>`;
}

function renderUnclaimed(payload) {
  setResultHeading("Specification concept coverage", `Representative family coverage review seeded from ${payload.idType} ${payload.identifier}. Low-scoring concepts are research candidates, not determinations of unclaimed scope.`);
  const items = [
    ["unclaimed", "Confirmation interval for persistent alerts", "The specification suppresses isolated transients by requiring the threshold to remain exceeded for a confirmation interval; no example family claim recites the interval.", "16%", "Specification ¶[0005] · No express family claim"],
    ["weak", "Probe-specific temperature coefficient", "Claim 1 requires temperature compensation but does not expressly tie the coefficient to the individual probe identifier.", "48%", "Specification ¶[0004] · Closest match: Example parent claim 1"],
    ["weak", "Bearing-housing trend display", "The maintenance server may display a trend for each bearing housing, while the reviewed claims stop at sending alert records.", "37%", "Specification ¶[0006] · Closest match: Example parent claim 1"],
    ["covered", "Buffered chronological retransmission", "Example continuation B expressly recites local buffering during an outage and chronological transmission after connectivity returns.", "94%", "Specification ¶[0007] · Example continuation B claim 8"]
  ];
  resultsContent.innerHTML = `<div class="summary-band">${stat("Concepts shown", items.length)} ${stat("Potentially unclaimed", "1")} ${stat("Weakly covered", "2")} ${stat("Data", "Illustrative")}</div><div class="coverage-list">${items.map((item) => `<article class="coverage-item"><span class="coverage-state ${item[0]}">${item[0]}</span><div><h3>${item[1]}</h3><p>${item[2]}</p><p>${item[4]}</p></div><div class="coverage-score"><small>Text overlap</small><strong>${item[3]}</strong></div></article>`).join("")}</div>`;
}

function renderArtUnit() {
  setResultHeading("Likely USPTO routing", "Illustrative routing estimate based on the example patent’s optical sensing, signal compensation, and condition-monitoring language.");
  const predictions = [["2123", "AI & simulation", 44, "Predictive maintenance and anomaly classification"], ["2124", "Computer systems", 24, "Controller, memory, and network-failure handling"], ["2858", "Optical measurements", 15, "Fiber Bragg grating and wavelength response"], ["3682", "Condition monitoring", 10, "Machine vibration thresholds and alerts"], ["2195", "Distributed processing", 7, "Mesh-connected probes and buffered records"]];
  resultsContent.innerHTML = `<div class="summary-band">${stat("Top prediction", "AU 2123")} ${stat("Illustrative score", "44%")} ${stat("Alternatives", "4")} ${stat("Data", "Example")}</div><div class="prediction-list">${predictions.map((item, index) => `<article class="prediction-row"><span class="prediction-rank">${String(index + 1).padStart(2, "0")}</span><div><h3>Art Unit ${item[0]}</h3><p>${item[1]}</p></div><div class="prediction-bar"><span style="width:${item[2]}%"></span></div><div class="prediction-value">${item[2]}%</div><div class="prediction-evidence"><strong>Routing evidence:</strong> ${item[3]}</div></article>`).join("")}</div><button class="analysis-link" type="button" data-tool="examiner">Open Art Unit 2123 analytics →</button>`;
}

function renderError(error) {
  progressPanel.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
  const overloaded = error.status === 429;
  setResultHeading(overloaded ? "Review capacity reached" : "Analysis could not complete", overloaded ? `This review could not start. Try again in ${error.retryAfter || "a few"} seconds.` : "No reviewable result was produced.");
  resultsContent.innerHTML = `<div class="error-box"><strong>${overloaded ? "Please retry shortly" : "Please try the review again"}</strong><p>${overloaded ? "Your input was not retained. The review can be resubmitted when capacity is available." : "If the problem continues, preserve your input and contact the workspace administrator."}</p></div>`;
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showExplanation() {
  const tool = tools[activeToolKey];
  if (!tool) return;
  document.getElementById("dialog-title").textContent = `How ${tool.shortTitle.toLowerCase()} works`;
  const exampleNote = tool.mode === "prototype" ? `<p><strong>${loadedMatter?.is_demo ? "Illustrative example" : "Preview"}:</strong> results use synthetic data and should not be treated as current prosecution evidence.</p>` : "";
  document.getElementById("dialog-content").innerHTML = `<p>${escapeHtml(tool.explanation)}</p><ol>${tool.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>${exampleNote}`;
  document.getElementById("explain-dialog").showModal();
}

function showDataHandling() {
  document.getElementById("dialog-title").textContent = "How review information is handled";
  document.getElementById("dialog-content").innerHTML = `<p>Claim and specification text is used to produce the current analysis and is not saved in review history.</p><ol><li>The built-in example uses a fixed synthetic patent and does not contact the USPTO.</li><li>Submitted text is checked before analysis begins.</li><li>Results preserve the passages needed for verification.</li><li>Public USPTO documents may be retained temporarily to avoid repeated retrieval and text extraction.</li><li>The attorney confirms every material conclusion against the authoritative record.</li></ol>`;
  document.getElementById("explain-dialog").showModal();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.add("hidden"), 3600);
}

renderToolGrid();
document.addEventListener("click", (event) => {
  const toolButton = event.target.closest("[data-tool]");
  if (toolButton) openTool(toolButton.dataset.tool);
  const viewButton = event.target.closest('[data-view="overview"]');
  if (viewButton) showOverview();
});
document.getElementById("back-overview").addEventListener("click", showOverview);
document.querySelector(".brand").addEventListener("click", (event) => { event.preventDefault(); showOverview(); });
document.getElementById("load-sample").addEventListener("click", loadSample);
document.getElementById("load-demo-record").addEventListener("click", loadDemoPatent);
document.getElementById("patent-lookup-form").addEventListener("submit", lookupPatent);
document.getElementById("how-button").addEventListener("click", showExplanation);
document.getElementById("data-handling").addEventListener("click", showDataHandling);
document.getElementById("new-review").addEventListener("click", () => { showOverview(); document.getElementById("lookup-identifier").focus(); });
document.getElementById("matter-button").addEventListener("click", () => { showOverview(); document.getElementById("lookup-identifier").focus(); });
document.querySelector(".avatar").addEventListener("click", () => showToast("Account settings are not available in this local preview."));
document.querySelector(".text-button").addEventListener("click", () => showToast("Completed analyses will appear here during this session."));
document.getElementById("mobile-menu").addEventListener("click", () => {
  const expanded = sidebar.classList.toggle("is-open");
  document.getElementById("mobile-menu").setAttribute("aria-expanded", String(expanded));
});
document.getElementById("copy-results").addEventListener("click", async () => {
  await navigator.clipboard.writeText(lastResultSummary);
  showToast("Result summary copied.");
});
document.getElementById("print-results").addEventListener("click", () => window.print());
toolForm.addEventListener("submit", runAnalysis);

const initialHash = location.hash.slice(1);
if (tools[initialHash]) openTool(initialHash); else showOverview();
