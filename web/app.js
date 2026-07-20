const tools = {
  "family-history": {
    index: "01",
    title: "Claim amendment history",
    shortTitle: "Amendment history",
    category: "Patent review",
    mode: "prototype",
    runtime: "Prosecution timeline preview",
    description: "Resolve a U.S. patent family and review how independent claim language changed from filing through allowance.",
    guidance: "Enter a U.S. patent or application number to review prosecution events across the related U.S. family.",
    contextTitle: "Read scope movement in sequence",
    contextCopy: "An amendment is evidence of prosecution history, not a standalone claim-construction conclusion. Review the cited office action and applicant response together.",
    steps: ["Resolve family", "Retrieve histories", "Compare claim text", "Render timeline"],
    explanation: "Starting from one U.S. patent or application, this review follows related family members, places prosecution events in sequence, and compares how independent claim language changed over time.",
    fields: "identifier",
    sample: { idType: "application", identifier: "18456219" }
  },
  "family-claims": {
    index: "02",
    title: "Compare U.S. family claims",
    shortTitle: "Compare family claims",
    category: "Patent review",
    mode: "prototype",
    runtime: "Family scope preview",
    description: "Line up granted independent claims across a U.S. family and isolate the limitations that changed portfolio scope.",
    guidance: "Start with one U.S. application or patent number to align independent claims from granted family members.",
    contextTitle: "Compare language before summaries",
    contextCopy: "The aligned claim text is the primary evidence. The generated difference summary is a navigation aid and should be checked against each patent.",
    steps: ["Resolve grants", "Collect claims", "Align language", "Summarize differences"],
    explanation: "This review identifies granted U.S. family members, aligns their latest independent claims, highlights added or changed limitations, and summarizes the principal differences in scope.",
    fields: "identifier",
    sample: { idType: "patent", identifier: "11874219" }
  },
  unclaimed: {
    index: "03",
    title: "Unclaimed subject matter",
    shortTitle: "Unclaimed subject matter",
    category: "Patent review",
    mode: "prototype",
    runtime: "Coverage review preview",
    description: "Surface specification concepts that appear weakly covered or absent across related U.S. claims.",
    guidance: "Provide a family seed to compare disclosed concepts with claims across the related U.S. family.",
    contextTitle: "A coverage lead, not a legal opinion",
    contextCopy: "A weak textual match can identify review candidates, but claim coverage depends on construction, equivalents, and the complete record.",
    steps: ["Load specification", "Extract concepts", "Collect family claims", "Score coverage"],
    explanation: "This review identifies disclosed concepts, compares them with claim language across the U.S. family, and surfaces areas that may warrant a closer coverage review.",
    fields: "identifier",
    sample: { idType: "application", identifier: "18456219" }
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
    fields: "support",
    sample: {
      patentText: "[0001] A sensing platform includes a distributed array of optical sensors positioned within an industrial enclosure. Each sensor generates a measurement signal representing local temperature and vibration.\n\n[0002] A controller receives the measurement signals through a low-power mesh network. The controller includes a processor and a memory storing calibration coefficients for each optical sensor.\n\n[0003] The processor applies a temperature compensation value to each measurement signal before calculating a vibration estimate. The compensation value may be selected from a calibration table according to the measured ambient temperature.\n\n[0004] When network connectivity is unavailable, each sensor stores timestamped measurements in a local buffer. Buffered measurements are transmitted after the mesh network reconnects.\n\n[0005] An alert engine compares the compensated vibration estimate with a machine-specific threshold and transmits a maintenance notification when the threshold is exceeded.",
      queries: ["temperature compensation based on ambient temperature", "store measurements while network connectivity is unavailable", "maintenance alert based on a machine-specific threshold"],
      topN: "5"
    }
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
    fields: "claim",
    sample: { claimText: "1. A sensing system comprising: a processor; a memory coupled to the processor; and the controller configured to store a calibration coefficient in the memory, wherein the processor applies the calibration coefficient to a measurement signal." }
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
    fields: "claim",
    sample: { claimText: "1. A sensing system comprising: a sensor configured to generate a measurement signal; a processor configured to receive the measurement signal and determine a compensated value based on at least one of an ambient temperature, a calibration coefficient, or a sensor age; and a transmitter configured to send an alert when the compensated value exceeds a threshold." }
  },
  "art-unit": {
    index: "07",
    title: "Art unit predictor",
    shortTitle: "Art unit predictor",
    category: "Drafting review",
    mode: "prototype",
    runtime: "Routing preview",
    description: "Rank the five most likely USPTO art units from invention text, then connect the estimate to examiner analytics.",
    guidance: "The loaded specification and claims provide the technical language used for the routing estimate.",
    contextTitle: "Routing estimates are directional",
    contextCopy: "Art unit assignment depends on classification practice and incoming workload. Treat ranked estimates as a planning signal, not a filing outcome.",
    steps: ["Review invention text", "Identify technical focus", "Rank art units", "Connect relevant trends"],
    explanation: "This review uses the invention description to rank likely USPTO art units and connect the leading candidates with the prosecution trends most useful for planning.",
    fields: "invention",
    sample: { inventionText: "A distributed optical sensing platform compensates vibration measurements according to ambient temperature and sensor-specific calibration coefficients. A mesh-connected controller detects machine anomalies and schedules predictive maintenance." }
  },
  examiner: {
    index: "08",
    title: "Examiner analytics",
    shortTitle: "Examiner analytics",
    category: "Examiner research",
    mode: "prototype",
    runtime: "Examiner trends preview",
    description: "Move from raw prosecution records to an examiner, art unit, work group, or technology-center strategy view.",
    guidance: "Search by examiner name, art unit, work group, or technology center. Preview results use representative prosecution data.",
    contextTitle: "Descriptive data needs context",
    contextCopy: "Observed grant ratios and rejection patterns describe past records. They do not predict a specific application or account for case mix by themselves.",
    steps: ["Resolve entity", "Aggregate records", "Calculate trends", "Render analytics"],
    explanation: "This review summarizes historical prosecution records into grant, office-action, rejection, and pendency trends for an examiner or organizational unit.",
    fields: "examiner",
    sample: { examinerQuery: "Art Unit 2123" }
  }
};

const demoToolOrder = ["family-history", "family-claims", "unclaimed", "support", "antecedent", "linguistic", "art-unit", "examiner"];
let activeToolKey = null;
let lastResultSummary = "";
let toastTimer = null;
let loadedMatter = null;

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
  const identifier = loadedMatter ? (loadedMatter.application_number || loadedMatter.patent_number) : "";
  const identifierType = loadedMatter && loadedMatter.application_number ? "application" : "patent";
  return `<div class="field-grid">
    ${field("Identifier type", `<select id="id-type" name="idType" aria-label="Identifier type"><option value="application" ${identifierType === "application" ? "selected" : ""}>Application number</option><option value="patent" ${identifierType === "patent" ? "selected" : ""}>Patent number</option></select>`)}
    ${field("U.S. identifier", `<input id="identifier" name="identifier" inputmode="numeric" autocomplete="off" aria-label="U.S. identifier" placeholder="18/456,219" value="${escapeHtml(identifier)}" required>`, "The current matter is filled automatically. Punctuation is optional.")}
  </div>`;
}

function matterSourceField(section) {
  if (!loadedMatter) {
    return `<div class="matter-source empty"><span>No patent record loaded</span><strong>Open a U.S. patent or application from Matter overview.</strong></div>`;
  }
  const count = section === "Specification" ? loadedMatter.specification_character_count : loadedMatter.claims_character_count;
  const detail = count ? `${count.toLocaleString()} characters ready` : `${section} text was not found in the retrieved document`;
  return `<div class="matter-source"><span>${escapeHtml(section)} from current matter</span><strong>${escapeHtml(loadedMatter.title || `Application ${loadedMatter.application_number}`)}</strong><small>${escapeHtml(detail)} · ${escapeHtml(loadedMatter.source)}</small></div>`;
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
    dynamicFields.innerHTML = field("Examiner, art unit, work group, or tech center", `<input id="examiner-query" name="examinerQuery" type="search" aria-label="Examiner, art unit, work group, or tech center" placeholder="Try: Art Unit 2123" required>`, "Search results can be narrowed by name or USPTO organizational unit.");
  }
  attachFieldBehavior(tool);
}

function attachFieldBehavior(tool) {
  if (tool.fields === "support") {
    addQueryRow("");
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
  if (loadedMatter) {
    renderFields(tool);
    showToast("Current USPTO record selected.");
    return;
  }
  if (["claim", "support", "invention"].includes(tool.fields)) {
    showOverview();
    document.getElementById("lookup-identifier").focus();
    showToast("Open a patent record before starting this review.");
    return;
  }
  const sample = tool.sample;
  if (tool.fields === "identifier") {
    document.getElementById("id-type").value = sample.idType;
    document.getElementById("identifier").value = sample.identifier;
  }
  if (tool.fields === "examiner") document.getElementById("examiner-query").value = sample.examinerQuery;
  showToast("Example identifier loaded.");
}

function collectPayload(tool) {
  if (tool.fields === "identifier") {
    const identifier = document.getElementById("identifier").value.replace(/\D/g, "");
    if (!identifier) throw new Error("Enter a U.S. patent or application number.");
    return { idType: document.getElementById("id-type").value, identifier };
  }
  if (tool.fields === "claim") {
    if (!loadedMatter) throw new Error("Open a patent record before running this analysis.");
    if (!loadedMatter.claims_character_count) throw new Error("No claims text was found in the retrieved specification.");
    return { record_id: loadedMatter.record_id };
  }
  if (tool.fields === "support") {
    const queries = [...document.querySelectorAll(".query-input")].map((input) => input.value.trim()).filter(Boolean);
    if (!loadedMatter) throw new Error("Open a patent record before running this search.");
    if (!loadedMatter.specification_character_count) throw new Error("No specification text was found in the retrieved record.");
    if (!queries.length) throw new Error("Add at least one limitation or concept.");
    return { record_id: loadedMatter.record_id, queries, top_n: Number(document.getElementById("top-n").value) };
  }
  if (tool.fields === "invention") {
    if (!loadedMatter) throw new Error("Open a patent record before predicting an art unit.");
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
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Request-ID": crypto.randomUUID() },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error((data && data.message) || `Analysis failed with HTTP ${response.status}.`);
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
  const application = formatApplicationNumber(loadedMatter.application_number);
  const patent = formatPatentNumber(loadedMatter.patent_number);
  document.getElementById("matter-name").textContent = title;
  document.getElementById("matter-meta").textContent = `US ${application} · ${loadedMatter.status || "Public record"}`;
  document.getElementById("record-status").textContent = "Loaded";
  document.getElementById("record-title").textContent = title;
  document.getElementById("record-application").textContent = application;
  document.getElementById("record-patent").textContent = patent;
  document.getElementById("record-case-status").textContent = loadedMatter.status || "—";
  document.getElementById("record-summary").classList.remove("hidden");
  document.getElementById("context-application").textContent = application;
  document.getElementById("context-patent").textContent = patent;
  document.getElementById("context-status").textContent = loadedMatter.status || "—";
  document.getElementById("context-source").textContent = "USPTO ODP";
}

async function lookupPatent(event) {
  event.preventDefault();
  const identifierType = document.getElementById("lookup-identifier-type").value;
  const identifier = document.getElementById("lookup-identifier").value.trim();
  const submit = document.getElementById("lookup-submit");
  const message = document.getElementById("lookup-message");
  submit.disabled = true;
  submit.textContent = "Opening…";
  message.textContent = "Retrieving the official file and preparing its specification and claims.";
  try {
    loadedMatter = await requestJson("/v1/patents/lookup", {
      identifier_type: identifierType,
      identifier
    });
    renderLoadedMatter();
    message.textContent = "Official record loaded. Choose a review task below.";
    showToast("USPTO record loaded.");
  } catch (error) {
    message.textContent = error.message;
    showToast(error.message);
  } finally {
    submit.disabled = false;
    submit.textContent = "Open";
  }
}

function executeTool(toolKey, payload) {
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
  setResultHeading("Antecedent basis review", high ? `${high} likely missing antecedent${high === 1 ? "" : "s"} require attorney review. Informational flags identify terms introduced but not reused.` : "No likely missing antecedent basis was identified by the heuristic review.");
  const cards = issues.map((issue, index) => `<article class="issue-card ${issue.severity === "info" ? "info" : ""}"><div class="issue-card-top"><span>${escapeHtml(issue.severity)} · ${escapeHtml(issue.code)}</span><span>I${String(index + 1).padStart(3, "0")}</span></div><h3>${escapeHtml(issue.title)}</h3><p>“${escapeHtml(issue.text)}” at characters ${issue.start}–${issue.end}. Confirm the intended antecedent in the complete claim chain.</p></article>`).join("");
  resultsContent.innerHTML = `<div class="summary-band">${stat("High", high)}${stat("Information", info)}${stat("Mentions tracked", (result.mentions || []).length)}${stat("Review state", high ? "Attention" : "Clear")}</div><div class="issue-layout"><div class="claim-paper">${highlightedClaim(result.claim_text || "", issues)}</div><div class="issue-list">${cards || '<article class="issue-card info"><h3>No flagged references</h3><p>The heuristic found no definite noun phrase without an earlier introduction.</p></article>'}</div></div>`;
}

function renderDiagrams(result) {
  const segments = result.segments || [];
  const frames = result.frames || [];
  setResultHeading("Claim structure", `${segments.length} linguistic segment${segments.length === 1 ? "" : "s"} extracted from the submitted claim. Inspect the action, object, and detail relationships before revising the draft.`);
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
  resultsContent.innerHTML = `<div class="summary-band">${stat("Segments", segments.length)}${stat("Review scope", "Claim text")}${stat("Output", "Structure map")}${stat("Decision", "Attorney review")}</div><div class="structure-map">${rows || '<div class="error-box"><strong>No structure generated</strong><p>Try preserving claim punctuation and transitional phrases.</p></div>'}</div>`;
}

function renderExaminer(payload) {
  setResultHeading("Art Unit 2123 analytics", `Representative prosecution trends for “${payload.examinerQuery}.” Confirm current records before relying on these values.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Observed grants", "71.4%")} ${stat("Avg. office actions", "2.6")} ${stat("Applications", "18,420")} ${stat("Status", "Preview")}</div><div class="chart-grid"><article class="chart-card"><h3>Observed grant timeline</h3><p>Share of disposed applications with an observed patent grant, by disposal year.</p><svg class="line-chart" viewBox="0 0 640 230" role="img" aria-label="Representative grant ratio trend"><line class="grid" x1="40" y1="40" x2="620" y2="40"/><line class="grid" x1="40" y1="110" x2="620" y2="110"/><line class="grid" x1="40" y1="180" x2="620" y2="180"/><path class="area" d="M40,157 L112,135 L184,143 L256,111 L328,101 L400,87 L472,94 L544,76 L616,68 L616,180 L40,180 Z"/><path class="line" d="M40,157 L112,135 L184,143 L256,111 L328,101 L400,87 L472,94 L544,76 L616,68"/>${[40,112,184,256,328,400,472,544,616].map((x,i)=>`<circle cx="${x}" cy="${[157,135,143,111,101,87,94,76,68][i]}" r="5"/>`).join("")}</svg></article><div class="metric-stack"><div><small>First-action §101</small><strong>18.2%</strong><p>Observed share of first office actions containing a §101 rejection.</p></div><div><small>First-action §103</small><strong>63.7%</strong><p>Observed share containing an obviousness rejection.</p></div><div><small>Median pendency</small><strong>31 mo.</strong><p>From filing to abandonment or observed grant.</p></div></div></div>`;
}

function renderFamilyHistory(payload) {
  setResultHeading("U.S. family prosecution timeline", `Representative claim-history view seeded from ${payload.idType} ${payload.identifier}. Verify every event against the linked Image File Wrapper record.`);
  const events = [
    ["Mar 2022", "Filed", "Independent claim 1 filed with sensor, controller, and alert limitations."],
    ["Nov 2023", "Non-final rejection", "§103 rejection over distributed monitoring references."],
    ["Feb 2024", "Amendment", "Added temperature compensation based on a stored calibration coefficient."],
    ["Sep 2024", "Final rejection", "Examiner maintained the combination and raised §112 clarity concerns."],
    ["Jan 2025", "Notice of allowance", "Clarified sensor-specific coefficient and offline measurement buffer."],
  ];
  resultsContent.innerHTML = `<div class="summary-band">${stat("Family members", "7")} ${stat("Prosecution events", "26")} ${stat("Independent claims", "11")} ${stat("Status", "Preview")}</div><article class="timeline-card"><h3>Claim 1 · Scope movement</h3><div class="timeline"><div class="timeline-events">${events.map((event, index) => `<div class="timeline-event ${index === events.length - 1 ? "allowance" : ""}"><small>${event[0]}</small><div class="timeline-dot"></div><strong>${event[1]}</strong><p>${event[2]}</p></div>`).join("")}</div></div></article>`;
}

function renderFamilyClaims(payload) {
  setResultHeading("Granted family claim comparison", `Three representative granted independent claims aligned from the family seeded by ${payload.idType} ${payload.identifier}. Highlighting distinguishes added and materially changed language.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Granted members", "3")} ${stat("Independent claims", "6")} ${stat("Shared core", "Sensor + controller")} ${stat("Status", "Preview")}</div><div class="claim-comparison"><div class="claim-columns"><article class="claim-column"><header><strong>US 11,874,219</strong><small>Parent · Claim 1</small></header><p>A sensing system comprising a sensor configured to generate a measurement signal and a controller configured to determine a compensated value <span class="diff-add">using a calibration coefficient stored for the sensor</span>.</p></article><article class="claim-column"><header><strong>US 12,041,882</strong><small>Continuation · Claim 1</small></header><p>A distributed sensing system comprising <span class="diff-change">a plurality of mesh-connected optical sensors</span> and a controller configured to determine compensated vibration values according to ambient temperature.</p></article><article class="claim-column"><header><strong>US 12,188,407</strong><small>Continuation · Claim 8</small></header><p>A method comprising receiving a sensor signal, applying a compensation value, and <span class="diff-add">storing timestamped measurements locally while network connectivity is unavailable</span>.</p></article></div></div><article class="comparison-summary"><h3>Difference summary</h3><p>The parent emphasizes sensor-specific calibration. The first continuation shifts toward distributed mesh topology and ambient-temperature compensation. The second continuation claims offline buffering as a method, creating a distinct operational fallback focus.</p></article>`;
}

function renderUnclaimed(payload) {
  setResultHeading("Specification concept coverage", `Representative family coverage review seeded from ${payload.idType} ${payload.identifier}. Low-scoring concepts are research candidates, not determinations of unclaimed scope.`);
  const items = [
    ["unclaimed", "Optical self-test pulse", "The specification describes a periodic emitter self-test; no close language was located in reviewed family claims.", "18%"],
    ["weak", "Calibration table interpolation", "One claim recites a calibration coefficient but not interpolation between temperature-indexed entries.", "42%"],
    ["weak", "Gateway handoff protocol", "Family claims address mesh reconnection generally, with limited detail on gateway handoff.", "51%"],
    ["covered", "Offline measurement buffer", "Expressly recited in US 12,188,407 claim 8.", "93%"]
  ];
  resultsContent.innerHTML = `<div class="summary-band">${stat("Concepts reviewed", "34")} ${stat("Potentially unclaimed", "1")} ${stat("Weakly claimed", "2")} ${stat("Status", "Preview")}</div><div class="coverage-list">${items.map((item) => `<article class="coverage-item"><span class="coverage-state ${item[0]}">${item[0]}</span><div><h3>${item[1]}</h3><p>${item[2]}</p></div><div class="coverage-score">${item[3]}</div></article>`).join("")}</div>`;
}

function renderArtUnit() {
  setResultHeading("Likely USPTO routing", "Representative top-five routing estimates. Confirm current classifications and routing practices independently.");
  const predictions = [["2123", "AI & simulation", 44], ["2124", "Computer systems", 24], ["2858", "Optical measurements", 15], ["3682", "Condition monitoring", 10], ["2195", "Distributed processing", 7]];
  resultsContent.innerHTML = `<div class="summary-band">${stat("Top prediction", "AU 2123")} ${stat("Confidence", "44%")} ${stat("Alternatives", "4")} ${stat("Status", "Preview")}</div><div class="prediction-list">${predictions.map((item, index) => `<article class="prediction-row"><span class="prediction-rank">${String(index + 1).padStart(2, "0")}</span><div><h3>Art Unit ${item[0]}</h3><p>${item[1]}</p></div><div class="prediction-bar"><span style="width:${item[2]}%"></span></div><div class="prediction-value">${item[2]}%</div></article>`).join("")}</div>`;
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
  document.getElementById("dialog-content").innerHTML = `<p>${escapeHtml(tool.explanation)}</p><ol>${tool.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>${tool.mode === "prototype" ? '<p><strong>Preview:</strong> results use representative matter data and should not be treated as current prosecution evidence.</p>' : ""}`;
  document.getElementById("explain-dialog").showModal();
}

function showDataHandling() {
  document.getElementById("dialog-title").textContent = "How review information is handled";
  document.getElementById("dialog-content").innerHTML = `<p>Claim and specification text is used to produce the current analysis and is not added to matter history.</p><ol><li>Submitted text is checked before analysis begins.</li><li>Results preserve the passages needed for verification.</li><li>Public USPTO documents may be retained temporarily to avoid repeated retrieval and text extraction.</li><li>The attorney confirms every material conclusion against the authoritative record.</li></ol>`;
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
document.getElementById("patent-lookup-form").addEventListener("submit", lookupPatent);
document.getElementById("how-button").addEventListener("click", showExplanation);
document.getElementById("data-handling").addEventListener("click", showDataHandling);
document.getElementById("new-review").addEventListener("click", () => { showOverview(); document.getElementById("lookup-identifier").focus(); });
document.getElementById("matter-button").addEventListener("click", () => { showOverview(); document.getElementById("lookup-identifier").focus(); });
document.querySelector(".avatar").addEventListener("click", () => showToast("Account settings are not available in this workspace preview."));
document.querySelector(".text-button").addEventListener("click", () => showToast("Completed analyses will appear here during this workspace session."));
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
