const tools = {
  "family-history": {
    index: "01",
    title: "U.S. patent family history",
    shortTitle: "Family history",
    category: "Patent review",
    mode: "prototype",
    runtime: "Prosecution timeline",
    description: "Review related U.S. applications, publications, grants, and independent claims in date order.",
    guidance: "Start with one U.S. patent or application number to review the related U.S. family.",
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
    guidance: "Independent claim 1 from the loaded USPTO record is mapped with its original punctuation and transitional phrases.",
    contextTitle: "Structure is easier to review when visible",
    contextCopy: "The diagram exposes linguistic relationships. It does not decide whether a limitation is definite, enabled, or patentable.",
    steps: ["Parse syntax", "Segment limitations", "Classify relationships", "Render diagram"],
    explanation: "This review separates the claim into limitations, then maps the actions, objects, details, alternatives, and dependencies so dense language can be inspected more easily.",
    fields: "claim"
  },
  "art-unit": {
    index: "07",
    title: "USPTO classification review",
    shortTitle: "Classification review",
    category: "Drafting review",
    mode: "prototype",
    runtime: "Official routing evidence",
    description: "Review official classification codes and determine whether the record supports an art-unit conclusion.",
    guidance: "The loaded USPTO record provides the official classification evidence used for this review.",
    contextTitle: "Classification evidence is not an art-unit result",
    contextCopy: "A public grant can show classification codes without stating the assigned art unit. Do not treat one as the other.",
    steps: ["Review invention text", "Collect classifications", "Check routing evidence", "State the record limit"],
    explanation: "This review presents the official classification codes in the loaded record and states whether the available evidence supports an art-unit conclusion.",
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
    guidance: "Search by examiner name, art unit, work group, or technology center.",
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
let recentAnalyses = [];
const demoRecord = window.PatentAgilityDemoRecord;
const browserState = window.PatentAgilityState;

const overviewView = document.getElementById("overview-view");
const toolView = document.getElementById("tool-view");
const toolGrid = document.getElementById("tool-grid");
const sidebar = document.getElementById("sidebar");
const toolForm = document.getElementById("tool-form");
const dynamicFields = document.getElementById("dynamic-fields");
const progressPanel = document.getElementById("progress-panel");
const resultsPanel = document.getElementById("results-panel");
const resultsContent = document.getElementById("results-content");
const recentTable = document.querySelector(".recent-table");
const clearHistoryButton = document.getElementById("clear-history");
const { requestJson } = window.PatentAgilityRequestClient.createRequestClient({
  errors: window.PatentAgilityErrors,
  onRetry: ({ attempt }) => {
    const message = "The service is busy. Your request will start automatically.";
    document.querySelectorAll(".lookup-message.is-working").forEach((element) => {
      element.textContent = message;
    });
    if (!progressPanel.classList.contains("hidden")) {
      document.getElementById("progress-title").textContent = "Waiting to start";
    }
    if (attempt === 1) showToast(message);
  }
});

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toolModeLabel(tool) {
  if (loadedMatter?.is_demo) return "Ready";
  return loadedMatter ? "Ready" : "Choose a patent";
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

function analysisRecordLabel(matter) {
  if (matter.is_demo) return matter.display_identifier;
  if (matter.application_number) return `US ${formatApplicationNumber(matter.application_number)}`;
  if (matter.patent_number) return `US ${formatPatentNumber(matter.patent_number)}`;
  return "U.S. patent record";
}

function renderRecentAnalyses() {
  clearHistoryButton.hidden = recentAnalyses.length === 0;
  if (!recentAnalyses.length) {
    recentTable.innerHTML = '<div class="empty-history"><strong>No analyses yet</strong><span>Open a patent record and choose a review task.</span></div>';
    return;
  }
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  recentTable.innerHTML = `<div class="recent-row recent-head"><span>Analysis</span><span>Patent</span><span>Completed</span><span>Status</span></div>${recentAnalyses.map((analysis) => {
    const tool = tools[analysis.toolKey];
    return `<button class="recent-row" type="button" data-analysis-id="${escapeHtml(analysis.id)}">
      <span><b>${escapeHtml(tool.shortTitle)}</b><small>${escapeHtml(analysis.resultTitle)}</small></span>
      <span>${escapeHtml(analysisRecordLabel(analysis.matter))}</span>
      <span><time datetime="${escapeHtml(analysis.createdAt)}">${escapeHtml(dateFormatter.format(new Date(analysis.createdAt)))}</time></span>
      <span class="result-status complete">Saved</span>
    </button>`;
  }).join("")}`;
}

async function persistCurrentMatter() {
  try {
    await browserState.saveCurrentMatter(loadedMatter);
  } catch (error) {
    console.error("Unable to save the selected patent", error);
    showToast("The patent is open, but this browser could not save it.");
  }
}

async function persistCompletedAnalysis(toolKey, result, payload) {
  const analysis = {
    id: crypto.randomUUID(),
    toolKey,
    createdAt: new Date().toISOString(),
    matter: loadedMatter,
    payload,
    result,
    resultTitle: document.getElementById("results-title").textContent
  };
  try {
    await browserState.saveAnalysis(analysis);
    recentAnalyses = await browserState.listAnalyses();
    renderRecentAnalyses();
  } catch (error) {
    console.error("Unable to save the completed analysis", error);
    showToast("The analysis completed, but this browser could not save it.");
  }
}

async function openSavedAnalysis(analysisId) {
  const analysis = recentAnalyses.find((item) => item.id === analysisId);
  if (!analysis || !tools[analysis.toolKey]) return;
  loadedMatter = analysis.matter;
  renderLoadedMatter();
  const persistence = persistCurrentMatter();
  openTool(analysis.toolKey);
  renderResult(analysis.toolKey, analysis.result, analysis.payload);
  await persistence;
  showToast("Saved analysis opened.");
}

async function clearAnalysisHistory() {
  try {
    await browserState.clearAnalyses();
    recentAnalyses = [];
    renderRecentAnalyses();
    showToast("Review history cleared.");
  } catch (error) {
    console.error("Unable to clear analysis history", error);
    showToast("Review history could not be cleared.");
  }
}

async function restoreBrowserState() {
  try {
    const [matter, analyses] = await Promise.all([
      browserState.getCurrentMatter(),
      browserState.listAnalyses()
    ]);
    recentAnalyses = analyses.filter((analysis) => {
      if (!tools[analysis.toolKey] || !analysis.matter) return false;
      return !analysis.matter.is_demo || analysis.matter.record_id === demoRecord.record_id;
    });
    if (matter) {
      loadedMatter = matter.is_demo ? demoRecord : matter;
      renderLoadedMatter();
      if (matter.is_demo) await browserState.saveCurrentMatter(loadedMatter);
    }
    renderRecentAnalyses();
  } catch (error) {
    console.error("Unable to restore saved review state", error);
    renderRecentAnalyses();
    showToast("Saved review state could not be restored in this browser.");
  }
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
  document.getElementById("input-assurance-copy").innerHTML = loadedMatter?.is_demo
    ? "<strong>Official USPTO record.</strong> This saved public record includes the complete grant specification and claims."
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

function patentLoaderMarkup(variant) {
  if (loadedMatter) {
    const application = formatApplicationNumber(loadedMatter.application_number);
    const patent = formatPatentNumber(loadedMatter.patent_number);
    return `<div class="patent-loader-component ${variant} loaded">
      <div class="record-summary">
        <strong>${escapeHtml(loadedMatter.title)}</strong>
        <dl>
          <div><dt>Application</dt><dd>${escapeHtml(application)}</dd></div>
          <div><dt>Patent</dt><dd>${escapeHtml(patent)}</dd></div>
          <div><dt>Status</dt><dd>${escapeHtml(loadedMatter.status || "—")}</dd></div>
        </dl>
        ${variant === "overview" ? '<button class="change-patent" type="button" data-change-patent>Open a different patent</button>' : ""}
      </div>
    </div>`;
  }

  return `<div class="patent-loader-component ${variant}" data-patent-record-loader>
    ${variant === "inline" ? '<div class="inline-loader-heading"><span>No patent loaded</span><strong>Choose a patent once. It will carry through every review.</strong></div>' : ""}
    <label>U.S. patent or application number</label>
    <div class="record-lookup-row">
      <select data-lookup-identifier-type aria-label="Identifier type">
        <option value="patent">Patent</option>
        <option value="application">Application</option>
      </select>
      <input data-lookup-identifier inputmode="numeric" autocomplete="off" aria-label="U.S. patent or application number" placeholder="12,345,678">
      <button type="button" data-patent-lookup-submit>Open</button>
    </div>
    <p class="lookup-message" data-lookup-message aria-live="polite">Numbers are resolved against the USPTO Open Data Portal.</p>
    <div class="demo-record-action">
      <div><strong>Open a real USPTO patent</strong><small>Use a saved official record without a USPTO account.</small></div>
      <button type="button" data-load-demo-record>Open US 9,922,200</button>
    </div>
  </div>`;
}

function renderPatentLoaders() {
  document.querySelectorAll("[data-record-loader-host]").forEach((host) => {
    host.innerHTML = patentLoaderMarkup(host.dataset.variant || "inline");
  });
}

function identifierFields() {
  return matterSourceField("Patent record");
}

function matterSourceField(section) {
  if (!loadedMatter) {
    return `<div class="inline-record-loader" data-record-loader-host data-variant="inline"></div>`;
  }
  const isTextSection = section === "Specification" || section === "Claims";
  const count = section === "Specification" ? loadedMatter.specification_character_count : loadedMatter.claims_character_count;
  const detail = isTextSection
    ? (count ? `${count.toLocaleString()} characters ready` : `${section} text was not found in the retrieved document`)
    : (loadedMatter.display_identifier || loadedMatter.source);
  const sourceLabel = loadedMatter.is_demo ? "saved USPTO record" : "loaded patent";
  const sourceDetail = loadedMatter.is_demo ? "Official document text · Used automatically" : "Used automatically for this review";
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
  if (!loadedMatter) {
    dynamicFields.innerHTML = matterSourceField("Patent record");
    renderPatentLoaders();
    syncRunButton();
    return;
  }
  if (tool.fields === "identifier") dynamicFields.innerHTML = identifierFields();
  if (tool.fields === "claim") dynamicFields.innerHTML = claimField();
  if (tool.fields === "support") dynamicFields.innerHTML = supportFields();
  if (tool.fields === "invention") {
    dynamicFields.innerHTML = matterSourceField("Specification");
  }
  if (tool.fields === "examiner") {
    const value = loadedMatter?.is_demo ? loadedMatter.review_examples.examiner_query : "";
    dynamicFields.innerHTML = `${matterSourceField("Analytics cohort")}${field("Examiner, art unit, work group, or tech center", `<input id="examiner-query" name="examinerQuery" type="search" aria-label="Examiner, art unit, work group, or tech center" placeholder="Try: Art Unit 2123" value="${escapeHtml(value)}" required>`, "Search results can be narrowed by name or USPTO organizational unit.")}`;
  }
  attachFieldBehavior(tool);
  renderPatentLoaders();
  syncRunButton();
}

function syncRunButton() {
  const runButton = document.getElementById("run-analysis");
  runButton.disabled = !loadedMatter;
  runButton.querySelector("span:first-child").textContent = loadedMatter ? "Run analysis" : "Choose a patent above";
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

function collectPayload(tool) {
  if (tool.mode === "prototype" && !loadedMatter?.is_demo) {
    throw new Error("This review currently needs the built-in USPTO record.");
  }
  if (tool.fields === "identifier") {
    if (loadedMatter?.is_demo) {
      return { idType: "patent", identifier: loadedMatter.patent_number };
    }
    if (!loadedMatter) throw new Error("Choose a patent before running this analysis.");
    const idType = loadedMatter.application_number ? "application" : "patent";
    const identifier = loadedMatter.application_number || loadedMatter.patent_number;
    return { idType, identifier };
  }
  if (tool.fields === "claim") {
    if (!loadedMatter) throw new Error("Open a patent record before running this analysis.");
    if (!loadedMatter.claims_character_count) throw new Error("No claims text was found in the retrieved specification.");
    if (loadedMatter.is_demo) {
      const claimText = activeToolKey === "linguistic" ? loadedMatter.principal_claim_text : loadedMatter.claims_text;
      return { claim_text: claimText };
    }
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
  const toolKey = activeToolKey;
  const tool = tools[toolKey];
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
    const resultPromise = executeTool(toolKey, payload);
    await animateProgress(tool, resultPromise);
    const result = await resultPromise;
    renderResult(toolKey, result, payload);
    await persistCompletedAnalysis(toolKey, result, payload);
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
  document.getElementById("matter-meta").textContent = loadedMatter.is_demo
    ? `${loadedMatter.display_identifier} · Saved USPTO record`
    : `US ${application} · ${loadedMatter.status || "Public record"}`;
  document.getElementById("record-status").textContent = "Loaded";
  document.getElementById("context-application").textContent = application;
  document.getElementById("context-patent").textContent = patent;
  document.getElementById("context-status").textContent = loadedMatter.status || "—";
  document.getElementById("context-source").textContent = loadedMatter.source;
  document.getElementById("source-assurance-title").textContent = "Official source";
  document.getElementById("source-assurance-copy").textContent = loadedMatter.is_demo ? "This saved record comes from USPTO Patent Public Search." : "Records are retrieved from the USPTO Open Data Portal.";
  renderToolGrid();
  renderPatentLoaders();
  if (activeToolKey) {
    const tool = tools[activeToolKey];
    document.getElementById("mode-badge").textContent = toolModeLabel(tool);
    document.getElementById("input-assurance-copy").innerHTML = loadedMatter.is_demo
      ? "<strong>Official USPTO record.</strong> This saved public record includes the complete grant specification and claims."
      : "<strong>Public record source.</strong> Confirm all material passages and bibliographic data against the official file before relying on them.";
    renderFields(tool);
  }
}

async function loadDemoPatent() {
  loadedMatter = demoRecord;
  renderLoadedMatter();
  await persistCurrentMatter();
  showToast("US 9,922,200 loaded.");
}

async function clearLoadedPatent() {
  loadedMatter = null;
  document.getElementById("matter-name").textContent = "No record loaded";
  document.getElementById("matter-meta").textContent = "Open a U.S. patent record";
  document.getElementById("record-status").textContent = "Not loaded";
  document.getElementById("context-application").textContent = "Not loaded";
  document.getElementById("context-patent").textContent = "Not loaded";
  document.getElementById("context-status").textContent = "Not loaded";
  document.getElementById("context-source").textContent = "USPTO";
  document.getElementById("source-assurance-title").textContent = "Official source";
  document.getElementById("source-assurance-copy").textContent = "Records are retrieved from the USPTO Open Data Portal.";
  renderToolGrid();
  renderPatentLoaders();
  if (activeToolKey) renderFields(tools[activeToolKey]);
  try {
    await browserState.clearCurrentMatter();
  } catch (error) {
    console.error("Unable to clear the selected patent", error);
    showToast("The saved patent could not be cleared from this browser.");
  }
}

async function lookupPatent(loader) {
  const identifierType = loader.querySelector("[data-lookup-identifier-type]").value;
  const identifierInput = loader.querySelector("[data-lookup-identifier]");
  const identifier = identifierInput.value.trim();
  const submit = loader.querySelector("[data-patent-lookup-submit]");
  const message = loader.querySelector("[data-lookup-message]");
  const validationMessage = PatentAgilityErrors.validatePatentIdentifier(identifierType, identifier);
  if (validationMessage) {
    message.textContent = validationMessage;
    message.className = "lookup-message is-error";
    identifierInput.focus();
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
    await persistCurrentMatter();
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
  setResultHeading("Specification evidence", `${hitCount} ranked passages across ${resultGroups.length} limitation${resultGroups.length === 1 ? "" : "s"}. Scores show relative retrieval rank, not a legal support conclusion.`);
  const groups = resultGroups.map((group, groupIndex) => `
    <section class="evidence-group">
      <div class="section-heading compact"><div><div class="eyebrow">Limitation ${String(groupIndex + 1).padStart(2, "0")}</div><h2>${escapeHtml(group.query)}</h2></div></div>
      <div class="evidence-list">${(group.hits || []).map((hit, index) => {
        const score = Number(hit.score || 0);
        const displayScore = score <= 1 ? Math.max(0, Math.min(100, score * 100)) : 100;
        return `<article class="evidence-hit"><div class="hit-rank">${String(index + 1).padStart(2, "0")}</div><div><h3>Paragraph ${Number(hit.paragraph_id) + 1}, sentence ${Number(hit.sentence_id) + 1}</h3><p>${escapeHtml(hit.sentence)}</p></div><footer>Retrieval score ${score.toFixed(3)}<div class="score-bar"><span style="width:${displayScore}%"></span></div></footer></article>`;
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
  const cards = issues.map((issue, index) => `<article class="issue-card ${issue.severity === "info" ? "info" : ""}"><div class="issue-card-top"><span>${escapeHtml(issue.severity === "high" ? "Needs review" : "Information")}</span><span>Finding ${String(index + 1).padStart(2, "0")}</span></div><h3>${escapeHtml(issue.title)}</h3><p>Review “${escapeHtml(issue.text)}” against the earlier claim language and confirm that the intended term has a clear introduction.</p></article>`).join("");
  resultsContent.innerHTML = `<div class="summary-band">${stat("High", high)}${stat("Information", info)}${stat("Mentions tracked", (result.mentions || []).length)}${stat("Review state", high ? "Attention" : "Clear")}</div><div class="issue-layout"><div class="claim-paper">${highlightedClaim(result.claim_text || "", issues)}</div><div class="issue-list">${cards || '<article class="issue-card info"><h3>No flagged references</h3><p>The heuristic found no definite noun phrase without an earlier introduction.</p></article>'}</div></div>`;
}

function renderDiagrams(result) {
  const segments = result.segments || [];
  const frames = result.frames || [];
  const demoScope = loadedMatter?.is_demo;
  setResultHeading("Claim structure", demoScope ? `${segments.length} segments extracted from claim 1 of US 9,922,200. Inspect the action, object, and detail relationships against the official claim text.` : `${segments.length} linguistic segment${segments.length === 1 ? "" : "s"} extracted from the submitted claim. Inspect the action, object, and detail relationships before revising the draft.`);
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
  resultsContent.innerHTML = `<div class="summary-band">${stat("Segments", segments.length)}${stat("Review scope", demoScope ? "Official claim 1" : "Claim text")}${stat("Output", "Structure map")}${stat("Decision", "Attorney review")}</div><div class="structure-map">${rows || '<div class="error-box"><strong>No structure generated</strong><p>Try preserving claim punctuation and transitional phrases.</p></div>'}</div>`;
}

function renderExaminer(payload) {
  const members = loadedMatter.family_members || [];
  const matchingMembers = members.filter((member) => member.examiner.toLowerCase().includes(payload.examinerQuery.toLowerCase()));
  const records = matchingMembers.length ? matchingMembers : members;
  setResultHeading("Examiner record", `Official front-page examiner data for the saved U.S. patent family. No cohort rate is shown because the saved patent documents do not contain one.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Query", payload.examinerQuery)}${stat("Family grants", members.length)}${stat("Matching grants", matchingMembers.length)}${stat("Source", "USPTO grants")}</div><div class="coverage-list">${records.map((member) => `<article class="coverage-item"><span class="coverage-state covered">Grant</span><div><h3>${escapeHtml(member.examiner)}</h3><p>${escapeHtml(member.document_number)} · Application ${escapeHtml(formatApplicationNumber(member.application_number))}</p><p>${escapeHtml(member.relationship)} · Granted ${escapeHtml(member.granted)}</p></div><div class="coverage-score"><small>Record</small><strong>Official</strong></div></article>`).join("")}</div><article class="comparison-summary"><h3>Cohort data is not in the patent document</h3><p>Grant rates, office-action counts, and pendency require a separate prosecution-record dataset. This view does not invent those values.</p></article>`;
}

function renderFamilyHistory(payload) {
  const events = loadedMatter.family_events || [];
  const sources = loadedMatter.source_documents || [];
  setResultHeading("U.S. patent family timeline", `Official filing, publication, and grant dates for the family seeded by US ${formatPatentNumber(payload.identifier)}.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Family members", loadedMatter.family_members.length)}${stat("Events shown", events.length)}${stat("First filing", events[0]?.date || "—")}${stat("Latest grant", events.at(-1)?.date || "—")}</div><article class="timeline-card"><h3>Public document history</h3><div class="timeline"><div class="timeline-events">${events.map((event, index) => `<div class="timeline-event ${index === events.length - 1 ? "allowance" : ""}"><small>${escapeHtml(event.date)}</small><div class="timeline-dot"></div><strong>${escapeHtml(event.label)}</strong><p>${escapeHtml(event.detail)}</p></div>`).join("")}</div></div></article><article class="comparison-summary"><h3>Official documents</h3><p>${sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} · ${escapeHtml(source.document_number)}</a>`).join(" · ")}</p><p>The saved documents prove this family timeline. Office actions and applicant responses need separate file-wrapper records and are not shown here.</p></article>`;
}

function renderFamilyClaims(payload) {
  const claims = loadedMatter.family_claims || [];
  setResultHeading("Granted family claim comparison", `${claims.length} official independent claims from the parent and continuation grants seeded by US ${formatPatentNumber(payload.identifier)}.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Family members shown", claims.length)}${stat("Claims aligned", claims.length)}${stat("Claim number", "1")}${stat("Source", "USPTO grants")}</div><div class="claim-comparison"><div class="claim-columns">${claims.map((item) => `<article class="claim-column"><header><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.document_number)} · Claim ${item.claim_number}</small></header><p>${escapeHtml(item.claim_text)}</p></article>`).join("")}</div></div><article class="comparison-summary"><h3>Review focus</h3><p>The parent claim receives encrypted content, stores it on the selected processor, and instructs decryption in a secure enclave. The continuation claim focuses on providing processors and processor-specific public keys. Read the complete claims before reaching a scope conclusion.</p></article>`;
}

function renderUnclaimed(payload) {
  const items = loadedMatter.coverage_candidates || [];
  setResultHeading("Specification concept coverage", `Evidence-backed research candidates from the official specification of US ${formatPatentNumber(payload.identifier)}. These are review prompts, not conclusions about claim scope.`);
  resultsContent.innerHTML = `<div class="summary-band">${stat("Concepts shown", items.length)}${stat("Family grants checked", loadedMatter.family_claims.length)}${stat("Status", "Needs review")}${stat("Source", "Official specification")}</div><div class="coverage-list">${items.map((item) => `<article class="coverage-item"><span class="coverage-state weak">Review</span><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.evidence)}</p><p>${escapeHtml(item.claim_check)}</p></div><div class="coverage-score"><small>Next step</small><strong>Compare</strong></div></article>`).join("")}</div>`;
}

function renderArtUnit() {
  const classifications = loadedMatter.classification_records || [];
  setResultHeading("Official classification context", "The saved grant provides CPC classification evidence. The public patent document does not state an art unit, so this view does not invent a routing prediction.");
  resultsContent.innerHTML = `<div class="summary-band">${stat("Classifications", classifications.length)}${stat("Scheme", "CPC")}${stat("Art unit", "Not stated")}${stat("Source", "USPTO grant")}</div><div class="prediction-list">${classifications.map((item, index) => `<article class="prediction-row"><span class="prediction-rank">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.code)}</h3><p>${escapeHtml(item.description)}</p></div><div class="prediction-evidence"><strong>${escapeHtml(item.scheme)} record</strong></div></article>`).join("")}</div><article class="comparison-summary"><h3>Routing limit</h3><p>A validated art-unit prediction needs training data that links invention text to actual USPTO routing outcomes. The saved grant alone cannot prove such a result.</p></article>`;
}

function renderError(error) {
  progressPanel.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
  const overloaded = error.status === 429;
  setResultHeading(overloaded ? "The review is still busy" : "Analysis could not complete", overloaded ? "The service could not start this review within two minutes." : "No reviewable result was produced.");
  resultsContent.innerHTML = `<div class="error-box"><strong>${overloaded ? "Please try again shortly" : "Please try the review again"}</strong><p>${overloaded ? "Your input is still available, so you can run the review again without re-entering it." : "If the problem continues, preserve your input and contact the workspace administrator."}</p></div>`;
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showExplanation() {
  const tool = tools[activeToolKey];
  if (!tool) return;
  document.getElementById("dialog-title").textContent = `How ${tool.shortTitle.toLowerCase()} works`;
  const exampleNote = tool.mode === "prototype" ? `<p><strong>${loadedMatter?.is_demo ? "Saved USPTO record" : "Preview"}:</strong> this review is limited to the evidence available in the loaded record.</p>` : "";
  document.getElementById("dialog-content").innerHTML = `<p>${escapeHtml(tool.explanation)}</p><ol>${tool.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>${exampleNote}`;
  document.getElementById("explain-dialog").showModal();
}

function showDataHandling() {
  document.getElementById("dialog-title").textContent = "How review information is handled";
  document.getElementById("dialog-content").innerHTML = `<p>The selected patent, review inputs, and completed results are saved in this browser so work can be resumed after a refresh.</p><ol><li>The current patent remains selected until another is opened. Completed analyses remain in IndexedDB until review history is cleared.</li><li>The built-in record contains text saved from official USPTO patent documents.</li><li>Review inputs are checked before analysis begins.</li><li>Results preserve the passages needed for verification.</li><li>The attorney confirms every material conclusion against the authoritative record.</li></ol>`;
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
renderPatentLoaders();
document.addEventListener("click", (event) => {
  const toolButton = event.target.closest("[data-tool]");
  if (toolButton) openTool(toolButton.dataset.tool);
  const viewButton = event.target.closest('[data-view="overview"]');
  if (viewButton) showOverview();
  const lookupButton = event.target.closest("[data-patent-lookup-submit]");
  if (lookupButton) lookupPatent(lookupButton.closest("[data-patent-record-loader]"));
  const demoButton = event.target.closest("[data-load-demo-record]");
  if (demoButton) loadDemoPatent();
  const changeButton = event.target.closest("[data-change-patent]");
  if (changeButton) {
    clearLoadedPatent();
    document.querySelector('[data-record-loader-host][data-variant="overview"] [data-lookup-identifier]')?.focus();
  }
  const savedAnalysisButton = event.target.closest("[data-analysis-id]");
  if (savedAnalysisButton) openSavedAnalysis(savedAnalysisButton.dataset.analysisId);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-lookup-identifier]")) return;
  event.preventDefault();
  lookupPatent(event.target.closest("[data-patent-record-loader]"));
});
document.getElementById("back-overview").addEventListener("click", showOverview);
document.querySelector(".brand").addEventListener("click", (event) => { event.preventDefault(); showOverview(); });
document.getElementById("how-button").addEventListener("click", showExplanation);
document.getElementById("data-handling").addEventListener("click", showDataHandling);
const openRecordOverview = () => {
  showOverview();
  document.querySelector('[data-record-loader-host][data-variant="overview"] [data-lookup-identifier]')?.focus();
};
document.getElementById("new-review").addEventListener("click", openRecordOverview);
document.getElementById("matter-button").addEventListener("click", openRecordOverview);
document.querySelector(".avatar").addEventListener("click", () => showToast("Account settings are not available in this local preview."));
clearHistoryButton.addEventListener("click", clearAnalysisHistory);
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

async function initializeApp() {
  await restoreBrowserState();
  const initialHash = location.hash.slice(1);
  if (tools[initialHash]) openTool(initialHash); else showOverview();
}

initializeApp();
