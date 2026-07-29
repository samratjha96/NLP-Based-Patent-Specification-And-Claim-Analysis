const tools = {
  "family-history": {
    index: "01",
    title: "Claim Amendment History Across U.S. Family",
    shortTitle: "Claim Amendment History",
    category: "Patent review",
    mode: "live",
    runtime: "Family map",
    description: "Follow the parent and continuation through filing, rejection, amendment, allowance, and the resulting independent claims.",
    guidance: "Start with one U.S. patent or application number to review the related U.S. family.",
    contextTitle: "Start with the family relationship",
    contextCopy: "The parent and continuation can pursue different claim scope while sharing disclosure. Review both grants before choosing a prosecution or enforcement position.",
    steps: ["Resolve family", "Order public events", "Compare claim 1", "Show the relationship"],
    explanation: "This review maps the parent and continuation, orders the public filing and grant events, and identifies the claim limitations that changed between the two grants.",
    fields: "identifier"
  },
  "family-claims": {
    index: "02",
    title: "Compare U.S. Family Claims",
    shortTitle: "Compare U.S. Family Claims",
    category: "Patent review",
    mode: "live",
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
    title: "Find Unclaimed Subject Matter in U.S. Family",
    shortTitle: "Find Unclaimed Subject Matter",
    category: "Patent review",
    mode: "live",
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
    title: "Spec Support",
    shortTitle: "Spec Support",
    category: "Drafting review",
    mode: "live",
    runtime: "Specification evidence search",
    description: "Find the passages most likely to support a limitation across the complete specification.",
    guidance: "The loaded USPTO specification is searched directly. Add every limitation you want to investigate in the same review.",
    contextTitle: "Ranked passages are starting points",
    contextCopy: "A high score means the passage is textually relevant, not necessarily that it satisfies written-description or enablement requirements. Read the full passage and surrounding disclosure.",
    steps: ["Validate input", "Build document index", "Search limitations", "Rank evidence"],
    explanation: "This review breaks the specification into passages, ranks the passages most relevant to each limitation, and preserves passage and sentence locations so the cited disclosure can be checked in context.",
    fields: "support"
  },
  antecedent: {
    index: "05",
    title: "Antecedent Basis",
    shortTitle: "Antecedent Basis",
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
    title: "Linguistic Claim Analysis",
    shortTitle: "Linguistic Claim Analysis",
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
    title: "Art Unit Predictor",
    shortTitle: "Art Unit Predictor",
    category: "Drafting review",
    mode: "record",
    runtime: "Official routing evidence",
    description: "Review official classification codes and determine whether the record supports an art-unit conclusion.",
    guidance: "The loaded USPTO record provides the official classification evidence used for this review.",
    contextTitle: "Separate observed routing from prediction",
    contextCopy: "The saved example shows the examiner's observed art-unit context and the grant's official CPC codes. A prediction for new text needs a validated routing model.",
    steps: ["Review invention text", "Collect classifications", "Check observed routing", "Separate fact from prediction"],
    explanation: "This review places the official CPC codes beside observed examiner routing data. It does not present observed routing as a prediction for a new application.",
    fields: "invention"
  },
  examiner: {
    index: "08",
    title: "Examiner Analytics",
    shortTitle: "Examiner Analytics",
    category: "Examiner research",
    mode: "record",
    runtime: "Examiner trends",
    description: "Review grant, office-action, rejection, and pendency trends for an examiner or USPTO group.",
    guidance: "Review the saved examiner profile for the examiner on this patent.",
    contextTitle: "Descriptive data needs context",
    contextCopy: "Observed grant ratios and rejection patterns describe past records. They do not predict a specific application or account for case mix by themselves.",
    steps: ["Resolve entity", "Aggregate records", "Calculate trends", "Render analytics"],
    explanation: "This review summarizes historical prosecution records into grant, office-action, rejection, and pendency trends for an examiner or organizational unit.",
    fields: "examiner"
  }
};

const demoToolOrder = ["family-history", "family-claims", "unclaimed", "support", "antecedent", "linguistic", "art-unit", "examiner"];
const PREPARED_REVIEW_TTL_MS = 6 * 60 * 60 * 1000;
let activeToolKey = null;
let toastTimer = null;
let loadedMatter = null;
let recentAnalyses = [];
let preparedReviewByTool = new Map();
let preparationToken = 0;
let preparationExpected = 0;
let preparationActive = false;
let preparingToolKeys = new Set();
let patentLookupExpanded = false;
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
const analysisColumn = document.querySelector(".analysis-column");
const recentTable = document.querySelector(".recent-table");
const recentSection = document.querySelector(".recent-section");
const clearHistoryButton = document.getElementById("clear-history");
const reviewBrief = document.getElementById("review-brief");
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

function isCompleteExampleIdentifier(identifierType, identifier) {
  const digits = String(identifier || "").replace(/\D/g, "");
  const expected = identifierType === "application"
    ? demoRecord.application_number
    : demoRecord.patent_number;
  return digits === expected;
}

function toolAvailability(toolKey) {
  if (!loadedMatter) return { available: true, label: "Open review" };
  if (toolKey === "family-history") {
    return {
      available: Boolean(loadedMatter.family_claims?.length && loadedMatter.prosecution_history?.length),
      label: "Complete example only"
    };
  }
  if (toolKey === "family-claims") {
    return {
      available: Boolean(loadedMatter.family_claims?.length),
      label: "Complete example only"
    };
  }
  if (toolKey === "unclaimed") {
    return {
      available: Boolean(loadedMatter.family_claims?.length && loadedMatter.coverage_candidates?.length),
      label: "Complete example only"
    };
  }
  if (toolKey === "support") {
    return { available: Boolean(loadedMatter.specification_character_count), label: "Patent text unavailable" };
  }
  if (toolKey === "antecedent" || toolKey === "linguistic") {
    return { available: Boolean(loadedMatter.claims_character_count), label: "Claims unavailable" };
  }
  if (toolKey === "art-unit") {
    return {
      available: Boolean(loadedMatter.classification_records?.length || loadedMatter.examiner_profile || loadedMatter.art_unit_prediction_example),
      label: "Complete example only"
    };
  }
  if (toolKey === "examiner") {
    return {
      available: Boolean(loadedMatter.examiner_profile),
      label: "Complete example only"
    };
  }
  return { available: true, label: "Open review" };
}

function syncNavigationToolAvailability() {
  document.querySelectorAll(".sidebar [data-tool]").forEach((button) => {
    const availability = toolAvailability(button.dataset.tool);
    button.disabled = !availability.available;
    button.title = availability.available
      ? ""
      : "This review is available with the complete US 9,922,200 example.";
  });
}

function renderToolGrid() {
  toolGrid.innerHTML = demoToolOrder.map((key) => {
    const tool = tools[key];
    const isPreparing = preparingToolKeys.has(key);
    const availability = toolAvailability(key);
    const unavailable = !availability.available;
    const actionLabel = isPreparing ? "Preparing" : unavailable ? availability.label : "Open review";
    return `
      <button class="tool-card ${isPreparing ? "is-preparing" : ""} ${unavailable ? "is-unavailable" : ""}" type="button" data-tool="${key}" data-index="${tool.index}" ${unavailable ? "disabled" : ""}>
        <span class="tool-card-top"><span class="tool-card-index">${tool.index} / ${escapeHtml(tool.category)}</span></span>
        <h3>${escapeHtml(tool.shortTitle)}</h3>
        <p>${escapeHtml(tool.description)}</p>
        <span class="tool-card-foot"><span>${escapeHtml(actionLabel)}</span><span aria-hidden="true">${isPreparing ? "…" : unavailable ? "—" : "→"}</span></span>
      </button>`;
  }).join("");
  syncNavigationToolAvailability();
}

function analysisRecordLabel(matter) {
  if (matter.is_demo) return matter.display_identifier;
  if (matter.application_number) return `US ${formatApplicationNumber(matter.application_number)}`;
  if (matter.patent_number) return `US ${formatPatentNumber(matter.patent_number)}`;
  return "U.S. patent record";
}

function renderRecentAnalyses() {
  clearHistoryButton.hidden = recentAnalyses.length === 0;
  recentSection.classList.toggle("hidden", recentAnalyses.length === 0);
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

function reviewCacheKey(toolKey, payload = {}) {
  const recordId = loadedMatter?.record_id || "no-record";
  let inputKey = "record";
  if (toolKey === "support") {
    inputKey = JSON.stringify({ queries: payload.queries || [], top_n: payload.top_n || 5 });
  }
  return `${recordId}::${toolKey}::${inputKey}`;
}

function preparedReviewIsFresh(review, now = Date.now()) {
  const preparedAt = Date.parse(review?.preparedAt);
  return Number.isFinite(preparedAt) && now - preparedAt < PREPARED_REVIEW_TTL_MS;
}

async function savePreparedReview(toolKey, result, payload) {
  const review = {
    cacheKey: reviewCacheKey(toolKey, payload),
    recordId: loadedMatter.record_id,
    toolKey,
    payload,
    result,
    preparedAt: new Date().toISOString()
  };
  preparedReviewByTool.set(toolKey, review);
  await browserState.savePreparedReview(review);
  renderToolGrid();
  renderReviewBrief();
  return review;
}

async function hydratePreparedReviews() {
  preparedReviewByTool = new Map();
  if (!loadedMatter) return;
  try {
    const reviews = await browserState.listPreparedReviews(loadedMatter.record_id);
    const expiredCacheKeys = [];
    const now = Date.now();
    reviews.forEach((review) => {
      const incompatibleFamilyHistory = loadedMatter.is_demo && review.toolKey === "family-history" && review.result?.diff_version !== 2;
      const incompatibleFamilyClaims = loadedMatter.is_demo && review.toolKey === "family-claims" && review.result?.comparison_version !== 2;
      const incompatibleAntecedent = loadedMatter.is_demo && review.toolKey === "antecedent" && review.result?.antecedent_version !== 2;
      if (!preparedReviewIsFresh(review, now) || incompatibleFamilyHistory || incompatibleFamilyClaims || incompatibleAntecedent) {
        expiredCacheKeys.push(review.cacheKey);
        return;
      }
      preparedReviewByTool.set(review.toolKey, review);
    });
    await browserState.deletePreparedReviews(expiredCacheKeys);
  } catch (error) {
    console.error("Unable to restore prepared reviews", error);
  }
  renderToolGrid();
  renderReviewBrief();
}

function briefFact(label, value) {
  return `<div><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function briefFinding(toolKey, label, title, copy, state = "ready") {
  return `<button class="brief-finding ${escapeHtml(state)}" type="button" data-tool="${escapeHtml(toolKey)}">
    <span class="brief-finding-mark" aria-hidden="true"></span>
    <span><small>${escapeHtml(label)}</small><strong>${escapeHtml(title)}</strong><em>${escapeHtml(copy)}</em></span>
    <span class="brief-finding-arrow" aria-hidden="true">→</span>
  </button>`;
}

function renderReviewBrief() {
  if (!loadedMatter) {
    reviewBrief.classList.add("hidden");
    return;
  }

  reviewBrief.classList.remove("hidden");
  const patent = loadedMatter.patent_number ? `US ${formatPatentNumber(loadedMatter.patent_number)}` : `US ${formatApplicationNumber(loadedMatter.application_number)}`;
  const familyMembers = loadedMatter.family_members?.length || 0;
  const independentClaims = loadedMatter.family_claims?.length || 0;
  const prosecutionEvents = (loadedMatter.prosecution_history || []).reduce((count, item) => count + (item.events || []).length, 0);
  document.getElementById("review-brief-title").textContent = loadedMatter.title || patent;
  document.getElementById("review-brief-meta").textContent = `${patent} · ${loadedMatter.status || "Public record"}`;
  document.getElementById("review-brief-facts").innerHTML = [
    briefFact("Application", formatApplicationNumber(loadedMatter.application_number)),
    briefFact("Family grants", familyMembers || "Review available"),
    briefFact("Independent claims", independentClaims || "Review available"),
    briefFact("Public events", prosecutionEvents || loadedMatter.document_count || "Review available")
  ].join("");

  const antecedent = preparedReviewByTool.get("antecedent")?.result;
  const family = preparedReviewByTool.get("family-claims")?.result;
  const coverage = preparedReviewByTool.get("unclaimed")?.result;
  const findings = [];
  const highAntecedentIssues = antecedent?.summary?.high || 0;
  if (highAntecedentIssues) {
    findings.push(briefFinding("antecedent", "Claim drafting", `${highAntecedentIssues} reference ${highAntecedentIssues === 1 ? "issue needs" : "issues need"} review`, "Open the highlighted claim language.", "attention"));
  }
  if (family) {
    const summary = family.summary || {};
    findings.push(briefFinding("family-claims", "Family scope", `${summary.comparison_rows || 0} claim pairs changed`, `See ${summary.changed_limitations || 0} modified limitation blocks in context.`, "clear"));
  } else if (loadedMatter.family_claims?.length) {
    findings.push(briefFinding("family-claims", "Family scope", preparationActive ? "Aligning independent claims" : "Compare independent claims", "Review scope changes across the parent and continuation.", preparationActive ? "working" : "ready"));
  }
  if (coverage?.concepts?.length) {
    findings.push(briefFinding("unclaimed", "Coverage review", `${coverage.concepts.length} concepts ready`, "Compare each disclosed concept with its closest family-claim language.", "ready"));
  } else if (loadedMatter.coverage_candidates?.length) {
    findings.push(briefFinding("unclaimed", "Coverage lead", preparationActive ? "Comparing disclosure and claims" : "Review potential coverage gaps", "The review ranks disclosed concepts against the family claims.", preparationActive ? "working" : "ready"));
  }
  if (prosecutionEvents && findings.length < 3) {
    findings.push(briefFinding("family-history", "Prosecution", `${prosecutionEvents} dated public events`, `${loadedMatter.prosecution_history.length} applications include rejection, amendment, and allowance history.`, "ready"));
  } else if (!prosecutionEvents && findings.length < 3) {
    findings.push(briefFinding("support", "Specification", "Search the disclosure", "Enter a limitation to find the strongest source passages.", "ready"));
  }
  document.getElementById("review-brief-findings").innerHTML = findings.slice(0, 3).join("");

  const status = document.getElementById("review-brief-status");
  const preparedCount = demoToolOrder.filter((key) => preparedReviewByTool.has(key)).length;
  const remaining = Math.max(0, preparationExpected - preparedCount);
  status.hidden = !preparationActive;
  status.classList.toggle("is-working", preparationActive);
  status.querySelector("strong").textContent = `Preparing ${remaining} ${remaining === 1 ? "review" : "reviews"}`;
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
  preparedReviewByTool = new Map();
  renderLoadedMatter();
  await hydratePreparedReviews();
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

async function clearBrowserData() {
  if (!window.confirm("Clear the selected patent, prepared reviews, review inputs, and analysis history from this browser?")) return;
  try {
    await browserState.clearAllData();
    recentAnalyses = [];
    renderRecentAnalyses();
    await clearLoadedPatent();
    showOverview();
    showToast("Browser review data cleared.");
  } catch (error) {
    console.error("Unable to clear browser review data", error);
    showToast("Browser review data could not be cleared.");
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
      await hydratePreparedReviews();
      if (matter.is_demo) await browserState.saveCurrentMatter(loadedMatter);
      void prepareCommonReviews();
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

function closeSidebar() {
  sidebar.classList.remove("is-open");
  document.getElementById("mobile-menu").setAttribute("aria-expanded", "false");
}

function showOverview() {
  activeToolKey = null;
  overviewView.classList.remove("hidden");
  toolView.classList.add("hidden");
  closeSidebar();
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
  closeSidebar();
  setActiveNavigation(toolKey);
  document.getElementById("tool-title").textContent = tool.shortTitle;
  document.getElementById("tool-description").textContent = tool.description;
  document.getElementById("form-guidance").textContent = tool.fields === "support"
    ? "Enter the limitation or concept you want to find."
    : "";
  toolForm.classList.toggle("simple-action", Boolean(loadedMatter && tool.fields !== "support"));
  renderFields(tool);
  analysisColumn.classList.remove("has-prepared-result", "has-result", "is-editing", "is-preparing");
  document.getElementById("adjust-input").hidden = true;
  progressPanel.classList.add("hidden");
  resultsPanel.classList.add("hidden");
  resultsContent.innerHTML = "";
  history.replaceState(null, "", `#${toolKey}`);
  window.scrollTo({ top: 0, behavior: "auto" });
  document.getElementById("main-content").focus();
  showPreparedReview(toolKey);
}

function showPreparedReview(toolKey) {
  let prepared = preparedReviewByTool.get(toolKey);
  if (prepared && !preparedReviewIsFresh(prepared)) {
    preparedReviewByTool.delete(toolKey);
    void browserState.deletePreparedReviews([prepared.cacheKey]);
    prepared = null;
    if (!preparationActive && loadedMatter) void prepareCommonReviews();
  }
  if (prepared) {
    renderResult(toolKey, prepared.result, prepared.payload, { prepared: true, scroll: false });
    syncRunButton();
    return;
  }
  if (preparingToolKeys.has(toolKey)) {
    showToolPreparationState();
    syncRunButton();
    return;
  }
  if (loadedMatter && tools[toolKey]?.mode === "record") {
    renderResult(toolKey, { record: true }, {}, { prepared: true, scroll: false });
    syncRunButton();
  }
}

function showToolPreparationState() {
  analysisColumn.classList.add("is-preparing");
  progressPanel.classList.add("is-background");
  progressPanel.classList.remove("hidden");
  document.getElementById("progress-title").textContent = "Preparing review";
  document.getElementById("progress-percent").textContent = "";
  document.getElementById("progress-fill").style.width = "35%";
  document.getElementById("progress-steps").innerHTML = "";
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
        ${variant === "overview" ? '<button class="change-patent" type="button" data-change-patent>Change patent</button>' : ""}
      </div>
    </div>`;
  }

  const dataSourceNote = `<p class="patent-data-note">US 9,922,200 includes all eight reviews. Other lookups use Google Patents for published patent text because this demo is not connected to the USPTO API. Prosecution history and examiner data may therefore be limited.</p>`;
  if (!patentLookupExpanded) {
    return `<div class="patent-loader-component ${variant} patent-start">
      ${variant === "inline" ? '<div class="inline-loader-heading"><strong>Choose a patent to continue.</strong></div>' : ""}
      <div class="patent-start-actions">
        <button class="use-preloaded-patent" type="button" data-load-demo-record>Use preloaded patent</button>
        <button class="show-patent-lookup" type="button" data-show-patent-lookup>Look up patent</button>
      </div>
      ${dataSourceNote}
    </div>`;
  }

  return `<div class="patent-loader-component ${variant}" data-patent-record-loader>
    <div class="patent-lookup-heading">
      <strong>Look up a patent</strong>
      <button type="button" data-hide-patent-lookup>Back</button>
    </div>
    <label>U.S. patent or application number</label>
    <div class="record-lookup-row">
      <select data-lookup-identifier-type aria-label="Identifier type">
        <option value="patent">Patent</option>
        <option value="application">Application</option>
      </select>
      <input data-lookup-identifier inputmode="numeric" autocomplete="off" aria-label="U.S. patent or application number" placeholder="12,345,678">
      <button type="button" data-patent-lookup-submit>Open</button>
    </div>
    <p class="lookup-message" data-lookup-message aria-live="polite"></p>
    ${dataSourceNote}
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
  return "";
}

function claimField() {
  return matterSourceField("Claims");
}

function supportFields() {
  return `
    ${matterSourceField("Specification")}
    <div class="field">
      <label><span>Limitations or concepts</span></label>
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
    dynamicFields.innerHTML = matterSourceField("Examiner on this patent");
  }
  attachFieldBehavior(tool);
  renderPatentLoaders();
  syncRunButton();
}

function syncRunButton() {
  const runButton = document.getElementById("run-analysis");
  const isPreparing = preparingToolKeys.has(activeToolKey);
  runButton.disabled = !loadedMatter || isPreparing;
  runButton.querySelector("span:first-child").textContent = !loadedMatter
    ? "Choose a patent above"
    : isPreparing
      ? "Preparing analysis"
    : preparedReviewByTool.has(activeToolKey) || tools[activeToolKey]?.mode === "record"
      ? tools[activeToolKey]?.mode === "record" && loadedMatter.is_demo
        ? "View saved example"
        : "Refresh analysis"
      : "Run analysis";
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
    if (!loadedMatter?.family_claims?.length) {
      throw new Error("Family claim data is not available for this patent record.");
    }
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
    if (activeToolKey === "antecedent" && loadedMatter.family_claims?.length) {
      return { claims: loadedMatter.family_claims };
    }
    if (loadedMatter.is_demo) {
      return { claim_text: loadedMatter.principal_claim_text };
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
  if (tool.fields === "examiner") return {};
  return {};
}

async function runAnalysis(event) {
  event.preventDefault();
  const toolKey = activeToolKey;
  const tool = tools[toolKey];
  if (!tool) return;
  if (preparingToolKeys.has(toolKey)) {
    showToast("This review is already preparing.");
    showToolPreparationState();
    return;
  }
  let payload;
  try {
    payload = collectPayload(tool);
  } catch (error) {
    showToast(error.message);
    return;
  }

  const runButton = document.getElementById("run-analysis");
  runButton.disabled = true;
  analysisColumn.classList.remove("has-prepared-result", "has-result", "is-editing");
  resultsPanel.classList.add("hidden");
  startProgress(tool);
  try {
    const resultPromise = executeTool(toolKey, payload);
    await animateProgress(tool, resultPromise);
    const result = await resultPromise;
    renderResult(toolKey, result, payload);
    await savePreparedReview(toolKey, result, payload);
    await persistCompletedAnalysis(toolKey, result, payload);
  } catch (error) {
    renderError(error);
  } finally {
    runButton.disabled = false;
  }
}

function startProgress(tool) {
  progressPanel.classList.remove("is-background");
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
  return digits.length === 8 ? `${digits.slice(0, 2)}/${digits.slice(2, 5)},${digits.slice(5)}` : (digits || "—");
}

function formatPatentNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits).toLocaleString("en-US") : "—";
}

function renderLoadedMatter() {
  if (!loadedMatter) return;
  patentLookupExpanded = false;
  const title = loadedMatter.title || `Application ${formatApplicationNumber(loadedMatter.application_number)}`;
  const application = formatApplicationNumber(loadedMatter.application_number);
  document.getElementById("matter-name").textContent = title;
  document.getElementById("matter-meta").textContent = loadedMatter.is_demo
    ? loadedMatter.display_identifier
    : `US ${application} · ${loadedMatter.status || "Public record"}`;
  overviewView.classList.add("has-record");
  document.getElementById("overview-title").textContent = loadedMatter.patent_number
    ? `Review US ${formatPatentNumber(loadedMatter.patent_number)}`
    : `Review US ${formatApplicationNumber(loadedMatter.application_number)}`;
  document.querySelector(".overview-hero > div:first-child > p").textContent = `${title}. Common claim and family checks are prepared below.`;
  renderToolGrid();
  renderPatentLoaders();
  renderReviewBrief();
  if (activeToolKey) {
    const tool = tools[activeToolKey];
    toolForm.classList.toggle("simple-action", tool.fields !== "support");
    renderFields(tool);
  }
}

async function loadDemoPatent() {
  loadedMatter = demoRecord;
  preparedReviewByTool = new Map();
  renderLoadedMatter();
  await persistCurrentMatter();
  await hydratePreparedReviews();
  if (activeToolKey) showPreparedReview(activeToolKey);
  void prepareCommonReviews();
  showToast("US 9,922,200 loaded.");
}

async function clearLoadedPatent() {
  preparationToken += 1;
  preparationActive = false;
  preparationExpected = 0;
  preparingToolKeys = new Set();
  preparedReviewByTool = new Map();
  loadedMatter = null;
  patentLookupExpanded = false;
  document.getElementById("matter-name").textContent = "No record loaded";
  document.getElementById("matter-meta").textContent = "Open a U.S. patent record";
  overviewView.classList.remove("has-record");
  document.getElementById("overview-title").textContent = "Start with the record.";
  document.querySelector(".overview-hero > div:first-child > p").textContent = "Open a U.S. patent or application. The same record stays available in every review.";
  renderReviewBrief();
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
  const completeExample = isCompleteExampleIdentifier(identifierType, identifier);
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
  message.textContent = completeExample
    ? "Opening the complete saved patent review."
    : "Retrieving the public patent record and preparing its specification and claims.";
  message.className = "lookup-message is-working";
  try {
    loadedMatter = completeExample
      ? demoRecord
      : await requestJson("/v1/patents/lookup", {
          identifier_type: identifierType,
          identifier
        });
    preparedReviewByTool = new Map();
    renderLoadedMatter();
    await persistCurrentMatter();
    await hydratePreparedReviews();
    if (activeToolKey) showPreparedReview(activeToolKey);
    void prepareCommonReviews();
    showToast(completeExample ? "Complete US 9,922,200 example loaded." : "Public patent record loaded.");
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
  if (toolKey === "family-history") {
    return requestJson("/v1/family/claims/compare", { claims: loadedMatter.family_claims })
      .then((comparison) => prepareFamilyHistoryResult(comparison, loadedMatter));
  }
  if (toolKey === "family-claims") {
    return requestJson("/v1/family/claims/compare", { claims: loadedMatter.family_claims });
  }
  if (toolKey === "unclaimed") {
    return requestJson("/v1/family/coverage", {
      claims: loadedMatter.family_claims,
      concepts: loadedMatter.coverage_candidates
    });
  }
  return Promise.resolve({ record: true });
}

function amendmentSnapshotKey(record, snapshot) {
  return `${record.application_number}:${snapshot.date}:${snapshot.claim_number || "summary"}`;
}

async function prepareFamilyHistoryResult(comparison, matter) {
  const snapshots = (matter?.prosecution_history || []).flatMap((record) =>
    (record.snapshots || [])
      .filter((snapshot) => snapshot.before_claim_text && snapshot.after_claim_text)
      .map((snapshot) => ({ record, snapshot }))
  );
  const amendmentDiffs = await Promise.all(snapshots.map(async ({ record, snapshot }) => {
    const diff = await requestJson("/v1/claims/diff", {
      before_claim_text: snapshot.before_claim_text,
      after_claim_text: snapshot.after_claim_text
    });
    return {
      key: amendmentSnapshotKey(record, snapshot),
      ...diff
    };
  }));
  return { ...comparison, diff_version: 2, amendment_diffs: amendmentDiffs };
}

function commonReviewTasks(matter, token) {
  const tasks = [];
  const addTask = (toolKeys, run) => tasks.push({ toolKeys, run });
  const saveIfCurrent = async (toolKey, result, payload) => {
    if (token !== preparationToken || loadedMatter?.record_id !== matter.record_id) return;
    await savePreparedReview(toolKey, result, payload);
    preparingToolKeys.delete(toolKey);
    renderToolGrid();
    syncRunButton();
    if (activeToolKey === toolKey && resultsPanel.classList.contains("hidden")) {
      showPreparedReview(toolKey);
    }
  };

  if (matter.is_demo && matter.specification_text && matter.review_examples?.support_queries?.length && !preparedReviewByTool.has("support")) {
    addTask(["support"], async () => {
      const payload = {
        patent_text: matter.specification_text,
        queries: matter.review_examples.support_queries,
        top_n: 3
      };
      const result = await requestJson("/v1/support/search", payload);
      await saveIfCurrent("support", result, payload);
    });
  }

  if (matter.claims_character_count) {
    const claimPayload = matter.is_demo
      ? { claim_text: matter.principal_claim_text }
      : { record_id: matter.record_id };
    const antecedentPayload = matter.family_claims?.length
      ? { claims: matter.family_claims }
      : claimPayload;
    if (!preparedReviewByTool.has("antecedent")) {
      addTask(["antecedent"], async () => {
        const result = await requestJson("/v1/claims/antecedent", antecedentPayload);
        await saveIfCurrent("antecedent", result, antecedentPayload);
      });
    }
    if (!preparedReviewByTool.has("linguistic")) {
      addTask(["linguistic"], async () => {
        const result = await requestJson("/v1/claims/diagram", claimPayload);
        await saveIfCurrent("linguistic", result, claimPayload);
      });
    }
  }

  if (matter.family_claims?.length && (!preparedReviewByTool.has("family-claims") || !preparedReviewByTool.has("family-history"))) {
    const familyToolKeys = ["family-claims", "family-history"].filter((toolKey) => !preparedReviewByTool.has(toolKey));
    addTask(familyToolKeys, async () => {
      const payload = { claims: matter.family_claims };
      const result = await requestJson("/v1/family/claims/compare", payload);
      if (!preparedReviewByTool.has("family-claims")) {
        await saveIfCurrent("family-claims", result, payload);
      }
      if (!preparedReviewByTool.has("family-history")) {
        const familyHistoryResult = await prepareFamilyHistoryResult(result, matter);
        await saveIfCurrent("family-history", familyHistoryResult, payload);
      }
    });
  }

  if (matter.family_claims?.length && matter.coverage_candidates?.length && !preparedReviewByTool.has("unclaimed")) {
    addTask(["unclaimed"], async () => {
      const payload = {
        claims: matter.family_claims,
        concepts: matter.coverage_candidates
      };
      const result = await requestJson("/v1/family/coverage", payload);
      await saveIfCurrent("unclaimed", result, payload);
    });
  }
  return tasks;
}

async function prepareCommonReviews() {
  if (!loadedMatter) return;
  const matter = loadedMatter;
  const token = ++preparationToken;
  const tasks = commonReviewTasks(matter, token);
  preparationExpected = tasks.length;
  if (!tasks.length) {
    preparationActive = false;
    preparingToolKeys = new Set();
    syncRunButton();
    renderReviewBrief();
    return;
  }

  preparationActive = true;
  preparingToolKeys = new Set(tasks.flatMap((task) => task.toolKeys));
  renderToolGrid();
  if (activeToolKey && preparingToolKeys.has(activeToolKey) && !preparedReviewByTool.has(activeToolKey)) {
    showToolPreparationState();
  }
  syncRunButton();
  renderReviewBrief();
  let nextTask = 0;
  const worker = async () => {
    while (nextTask < tasks.length && token === preparationToken) {
      const task = tasks[nextTask];
      nextTask += 1;
      try {
        await task.run();
      } catch (error) {
        console.warn("A background review could not be prepared", error);
      }
      if (token === preparationToken) {
        task.toolKeys.forEach((toolKey) => preparingToolKeys.delete(toolKey));
        renderToolGrid();
        syncRunButton();
        renderReviewBrief();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, tasks.length) }, worker));
  if (token !== preparationToken) return;
  preparationActive = false;
  preparingToolKeys = new Set();
  renderToolGrid();
  renderReviewBrief();
}

function renderResult(toolKey, result, payload, { prepared = false, scroll = true } = {}) {
  progressPanel.classList.remove("is-background");
  progressPanel.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
  analysisColumn.classList.remove("is-preparing");
  analysisColumn.classList.toggle("has-prepared-result", prepared);
  analysisColumn.classList.add("has-result");
  analysisColumn.classList.remove("is-editing");
  const adjustInput = document.getElementById("adjust-input");
  const adjustableLabels = { support: "Change limitations" };
  adjustInput.hidden = !adjustableLabels[toolKey];
  adjustInput.textContent = adjustableLabels[toolKey] || "Review input";
  if (toolKey === "support") renderSupport(result);
  if (toolKey === "antecedent") renderAntecedent(result);
  if (toolKey === "linguistic") renderDiagrams(result);
  if (toolKey === "examiner") renderExaminer(payload);
  if (toolKey === "family-history") renderFamilyHistory(result, payload);
  if (toolKey === "family-claims") renderFamilyClaims(result, payload);
  if (toolKey === "unclaimed") renderUnclaimed(result, payload);
  if (toolKey === "art-unit") renderArtUnit(payload);
  if (scroll) resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setResultHeading(title, summary) {
  document.getElementById("results-title").textContent = title;
  document.getElementById("results-summary").textContent = summary;
}

function stat(label, value) {
  return `<div class="summary-stat"><small>${escapeHtml(label)}</small><strong>${escapeHtml(value)}</strong></div>`;
}

function displayDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function percentageLineChart(series) {
  const width = 720;
  const height = 260;
  const left = 52;
  const right = 18;
  const top = 18;
  const bottom = 42;
  const innerWidth = width - left - right;
  const innerHeight = height - top - bottom;
  const x = (index) => left + (series.length === 1 ? 0 : (index / (series.length - 1)) * innerWidth);
  const y = (value) => top + (1 - Math.max(0, Math.min(100, value)) / 100) * innerHeight;
  const points = series.map((item, index) => `${x(index).toFixed(1)},${y(item.grant_rate).toFixed(1)}`).join(" ");
  const area = `${left},${top + innerHeight} ${points} ${left + innerWidth},${top + innerHeight}`;
  const yGrid = [0, 25, 50, 75, 100].map((value) => `<line class="grid" x1="${left}" y1="${y(value)}" x2="${left + innerWidth}" y2="${y(value)}"></line><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${value}%</text>`).join("");
  const labelIndexes = new Set([0, series.length - 1, ...series.map((_item, index) => index).filter((index) => index % 4 === 0)]);
  const xLabels = series.map((item, index) => labelIndexes.has(index) ? `<text class="axis-label" x="${x(index)}" y="${height - 14}" text-anchor="middle">${item.year}</text>` : "").join("");
  const circles = series.map((item, index) => `<circle cx="${x(index)}" cy="${y(item.grant_rate)}" r="4"><title>${item.year}: ${item.grant_rate.toFixed(1)}% · ${item.granted}/${item.applications} grants</title></circle>`).join("");
  return `<svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Yearly observed grant rate from ${series[0]?.year} through ${series.at(-1)?.year}">${yGrid}<polygon class="area" points="${area}"></polygon><polyline class="line" points="${points}"></polyline>${circles}${xLabels}</svg>`;
}

function comparisonTable(profile) {
  const rows = profile.context_comparison.map((item) => `<tr><th scope="row">${escapeHtml(item.scope)}</th><td>${Number(item.examiners).toLocaleString()}</td><td>${item.grant_ratio.toFixed(1)}%</td><td>${item.average_office_actions_per_grant.toFixed(2)}</td></tr>`).join("");
  return `<div class="table-card"><div class="table-card-heading"><h3>Context comparison</h3><p>Observed lifetime outcomes across progressively broader cohorts.</p></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Scope</th><th>Examiners</th><th>Grant ratio</th><th>Avg. OA / grant</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function examinerOutcomeSummary(metrics) {
  const nonGrantRatio = 100 - metrics.grant_ratio;
  return `<article class="examiner-outcomes">
    <div class="examiner-section-heading">
      <div>
        <small>Observed outcomes</small>
        <h3>${metrics.applications.toLocaleString()} evaluated applications</h3>
      </div>
      <p>Each application is counted once in the saved cohort.</p>
    </div>
    <div class="outcome-bar" aria-label="${metrics.granted.toLocaleString()} granted applications and ${metrics.not_granted.toLocaleString()} non-granted applications">
      <span class="outcome-granted" style="width: ${metrics.grant_ratio}%"></span>
      <span class="outcome-not-granted" style="width: ${nonGrantRatio}%"></span>
    </div>
    <div class="outcome-labels">
      <div><span class="outcome-key granted"></span><strong>${metrics.granted.toLocaleString()}</strong><p>Granted · ${metrics.grant_ratio.toFixed(1)}%</p></div>
      <div><span class="outcome-key not-granted"></span><strong>${metrics.not_granted.toLocaleString()}</strong><p>Not granted · ${nonGrantRatio.toFixed(1)}%</p></div>
    </div>
  </article>`;
}

function examinerCoverage(profile) {
  return `<article class="examiner-coverage">
    <div class="examiner-section-heading">
      <div>
        <small>Record coverage</small>
        <h3>What this profile includes</h3>
      </div>
    </div>
    <dl>
      <div><dt>Observed examiner years</dt><dd>${escapeHtml(profile.observed_years)}</dd></div>
      <div><dt>Latest office action</dt><dd>${escapeHtml(displayDate(profile.data_recency))}</dd></div>
      <div><dt>Art units seen</dt><dd>${(profile.art_units_seen || [profile.art_unit]).map(escapeHtml).join(", ")}</dd></div>
      <div><dt>Work groups seen</dt><dd>${(profile.work_groups_seen || [profile.group]).map(escapeHtml).join("<br>")}</dd></div>
      <div><dt>Predicted supervisor</dt><dd>${escapeHtml(profile.predicted_supervisor || "Not available")}<small>Prediction in the source profile</small></dd></div>
    </dl>
  </article>`;
}

function section101YearlyChart(profile) {
  const series = profile.section_101_timeline || [];
  const policyMarkers = profile.section_101_policy_markers || [];
  const markerMap = new Map(policyMarkers.map((marker) => [marker.year, marker.label]));
  const bars = series.map((item) => {
    const marker = markerMap.get(item.year);
    const barHeight = Math.min(100, (item.rejection_rate / 20) * 100);
    const markerMarkup = marker ? '<span class="policy-dot" aria-hidden="true"></span>' : "";
    return `<div class="section-101-year" aria-label="${item.year}: ${item.rejection_rate.toFixed(1)} percent of observed office actions included a Section 101 rejection${marker ? `; ${marker}` : ""}">
      <span class="section-101-value">${item.rejection_rate.toFixed(1)}%</span>
      <div class="section-101-column"><span style="height: ${barHeight}%"></span></div>
      <strong>${item.year}</strong>
      ${markerMarkup}
    </div>`;
  }).join("");
  const markers = policyMarkers.map((marker) => `<li><strong>${marker.year}</strong><span>${escapeHtml(marker.label)}</span></li>`).join("");
  return `<article class="table-card section-101-card">
    <div class="table-card-heading">
      <h3>§ 101 rejection trend</h3>
      <p>Share of this examiner’s observed office actions in each year that included a § 101 rejection.</p>
    </div>
    <div class="section-101-scroll">
      <div class="section-101-bars" role="img" aria-label="Yearly Section 101 rejection rate from ${series[0]?.year} through ${series.at(-1)?.year}">${bars}</div>
    </div>
    <ul class="policy-marker-list" aria-label="Patent eligibility policy markers">${markers}</ul>
  </article>`;
}

function renderEvidenceHit(hit, label) {
  return `<article class="evidence-hit">
    <div class="hit-rank">${escapeHtml(label)}</div>
    <div>
      <h3>Passage ${Number(hit.paragraph_id) + 1}, sentence ${Number(hit.sentence_id) + 1}</h3>
      <p>${highlightSentenceInPassage(hit.paragraph, hit.sentence)}</p>
    </div>
  </article>`;
}

function renderSupport(result) {
  const resultGroups = Array.isArray(result.results) ? result.results : [];
  const hitCount = resultGroups.reduce((total, group) => total + (group.hits || []).length, 0);
  const alternativeCount = Math.max(0, hitCount - resultGroups.length);
  setResultHeading("Best specification passages", `The first passage under each limitation is the strongest text match. Read the surrounding disclosure before you rely on it.`);
  const groups = resultGroups.map((group, groupIndex) => {
    const hits = group.hits || [];
    const best = hits[0];
    const alternatives = hits.slice(1);
    const alternativeResults = alternatives.map((hit, index) => renderEvidenceHit(hit, `Alternative ${index + 1}`)).join("");
    return `<section class="evidence-group">
      <div class="section-heading compact"><div><div class="eyebrow">Limitation ${groupIndex + 1}</div><h2>${escapeHtml(group.query)}</h2></div></div>
      <div class="evidence-list">
        ${best ? renderEvidenceHit(best, "Best match") : '<div class="error-box"><strong>No passage returned</strong></div>'}
        ${alternatives.length ? `<details class="evidence-alternatives"><summary>Show ${alternatives.length} alternative passage${alternatives.length === 1 ? "" : "s"}</summary><div>${alternativeResults}</div></details>` : ""}
      </div>
    </section>`;
  }).join("");
  resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Limitations", resultGroups.length)}${stat("Best matches", resultGroups.length)}${stat("Alternatives", alternativeCount)}</div>${groups || '<div class="error-box"><strong>No passages returned</strong><p>Confirm that the specification contains readable sentences.</p></div>'}`;
}

function highlightSentenceInPassage(paragraph, sentence) {
  const passage = String(paragraph || sentence || "");
  const match = String(sentence || "");
  const matchStart = match ? passage.indexOf(match) : -1;
  if (matchStart < 0) return escapeHtml(passage);
  return `${escapeHtml(passage.slice(0, matchStart))}<mark class="support-match">${escapeHtml(match)}</mark>${escapeHtml(passage.slice(matchStart + match.length))}`;
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
  const analyzedClaims = result.claims?.length
    ? result.claims
    : [{
        label: "Loaded patent",
        document_number: "",
        claim_number: 1,
        claim_text: result.claim_text || "",
        issues: result.issues || [],
        summary: result.summary || {}
      }];
  const highIssues = (result.issues || []).filter((issue) => issue.severity === "high");
  const informationIssues = (result.issues || []).filter((issue) => issue.severity !== "high");
  const high = result.summary?.high || 0;
  const claimCount = result.summary?.claim_count || analyzedClaims.length;
  setResultHeading(
    high
      ? `${high} possible reference problem${high === 1 ? "" : "s"} across ${claimCount} independent claims`
      : `No likely antecedent-basis problem across ${claimCount} independent claims`,
    high
      ? "Start with the highlighted definite reference. Confirm whether the earlier claim language introduces the same element."
      : "No definite reference lacked a likely earlier introduction. Optional drafting observations remain available below."
  );
  const flaggedClaims = analyzedClaims
    .filter((claim) => claim.issues?.some((issue) => issue.severity === "high"))
    .sort((left, right) => (right.summary?.high || 0) - (left.summary?.high || 0));
  const claimReviews = flaggedClaims.map((claim) => {
    const claimHighIssues = claim.issues.filter((issue) => issue.severity === "high");
    const cards = claimHighIssues.map((issue) => `<article class="issue-card"><div class="issue-card-top"><span>${escapeHtml(issue.issue_id)}</span><span>${escapeHtml(issue.confidence_label || "Review")} confidence</span></div><h3>“${escapeHtml(issue.text)}” needs an earlier introduction</h3><p>${escapeHtml(issue.message)}</p></article>`).join("");
    const documentLabel = [claim.document_number, `Claim ${claim.claim_number}`].filter(Boolean).join(" · ");
    return `<section class="antecedent-claim-review">
      <header><small>${escapeHtml(claim.label || "Independent claim")}</small><h3>${escapeHtml(documentLabel)}</h3></header>
      <div class="issue-layout">
        <div><h4>Claim text</h4><div class="claim-paper">${highlightedClaim(claim.claim_text, claimHighIssues)}</div></div>
        <div class="issue-list"><h4>Term to review</h4>${cards}</div>
      </div>
    </section>`;
  }).join("");
  const observationGroups = analyzedClaims.map((claim) => {
    const claimObservations = (claim.issues || []).filter((issue) => issue.severity !== "high");
    if (!claimObservations.length) return "";
    const documentLabel = [claim.document_number, `Claim ${claim.claim_number}`].filter(Boolean).join(" · ");
    return `<section><h4>${escapeHtml(documentLabel)}</h4><ul>${claimObservations.map((issue) => `<li><strong>${escapeHtml(issue.text)}</strong><span>${escapeHtml(issue.message)}</span></li>`).join("")}</ul></section>`;
  }).join("");
  const primaryResult = high
    ? `<div class="antecedent-primary-list">${claimReviews}</div>`
    : `<article class="clear-result antecedent-clear-result"><strong>No missing introduction found</strong><p>No definite reference lacked a likely earlier introduction.</p></article>`;
  resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Independent claims checked", claimCount)}${stat("Needs review", high)}</div>${primaryResult}${informationIssues.length ? `<details class="secondary-findings antecedent-observations"><summary>Show ${informationIssues.length} optional drafting observation${informationIssues.length === 1 ? "" : "s"}</summary><div class="optional-claim-groups">${observationGroups}</div></details>` : ""}`;
}

function renderDiagrams(result) {
  const segments = result.segments || [];
  const frames = result.frames || [];
  const demoScope = loadedMatter?.is_demo;
  setResultHeading(`Claim 1 separates into ${segments.length} limitation blocks`, demoScope ? "Follow each action to its object and supporting detail, then confirm the structure against claim 1 of US 9,922,200." : "Follow each action to its object and supporting detail, then confirm the structure against the submitted claim.");
  const rows = segments.map((segment, index) => {
    const frame = frames[index] || {};
    const leaves = frame.leaves || [];
    const alternatives = frame.or_alternatives || [];
    const action = frame.anchor_verb || "Action not isolated";
    const object = frame.object_np || "Contextual object";
    return `<details class="structure-row" ${index === 0 ? "open" : ""}>
      <summary class="structure-summary">
        <span>${String(index + 1).padStart(2, "0")}</span>
        <div><small>${escapeHtml(segment.kind || "limitation")}</small><strong>${escapeHtml(action)} <i aria-hidden="true">→</i> ${escapeHtml(object)}</strong></div>
        <em>${leaves.length + alternatives.length} supporting detail${leaves.length + alternatives.length === 1 ? "" : "s"}</em>
      </summary>
      <div class="structure-detail">
        <div class="structure-segment"><span>Claim language</span><p>${escapeHtml(segment.text)}</p></div>
        <div class="frame-nodes">
          <div class="frame-node action"><small>Action</small><strong>${escapeHtml(action)}</strong></div>
          <div class="frame-node object"><small>Object</small><strong>${escapeHtml(object)}</strong></div>
          ${leaves.map((leaf) => `<div class="frame-node detail"><small>${escapeHtml(leaf.label || "Detail")}</small><strong>${escapeHtml(leaf.text)}</strong></div>`).join("")}
          ${alternatives.map((alternative) => `<div class="frame-node alternative"><small>Alternative</small><strong>${escapeHtml(alternative)}</strong></div>`).join("")}
        </div>
      </div>
    </details>`;
  }).join("");
  resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Limitation blocks", segments.length)}${stat("Source", demoScope ? "Official claim 1" : "Submitted claim")}</div><div class="structure-map">${rows || '<div class="error-box"><strong>No structure generated</strong><p>Try preserving claim punctuation and transitional phrases.</p></div>'}</div>`;
}

function renderExaminer() {
  const profile = loadedMatter.examiner_profile;
  if (!profile) {
    setResultHeading("Examiner example not available", "This patent does not include a saved examiner analytics example.");
    resultsContent.innerHTML = '<div class="error-box"><strong>No saved examiner profile</strong><p>Open the built-in patent to review the complete examiner example.</p></div>';
    return;
  }
  const metrics = profile.metrics;
  const completeTimeline = profile.grant_timeline.slice(0, -2);
  const excludedYears = profile.grant_timeline.slice(-2).map((item) => item.year).join("–");
  const rejectionRows = profile.rejection_timeline.map((item) => `<tr><th scope="row">${item.office_action_number}</th><td>${item.office_actions.toLocaleString()}</td><td>${item.section_101.toFixed(1)}%</td><td>${item.section_102.toFixed(1)}%</td><td>${item.section_103.toFixed(1)}%</td><td>${item.section_112.toFixed(1)}%</td></tr>`).join("");
  setResultHeading(`${profile.name}: ${metrics.grant_ratio.toFixed(1)}% observed grant ratio`, `${metrics.applications.toLocaleString()} applications are included in the saved cohort. Use the peer comparison and rejection history as context, not as a result forecast.`);
  const validation = profile.grant_validation || {};
  resultsContent.innerHTML = `<div class="summary-band compact-facts">
      ${stat("Grant ratio", `${metrics.grant_ratio.toFixed(1)}%`)}
      ${stat("Avg. OA / grant", metrics.average_office_actions_per_grant.toFixed(2))}
      ${stat("Applications", metrics.applications.toLocaleString())}
      ${stat("Art unit", profile.art_unit)}
    </div>
    <div class="examiner-overview-grid">
      ${examinerOutcomeSummary(metrics)}
      ${examinerCoverage(profile)}
    </div>
    <div class="chart-grid">
      <article class="chart-card">
        <h3>Observed grant timeline</h3>
        <p>Only years with mature outcomes are plotted.</p>
        ${percentageLineChart(completeTimeline)}
        <p class="chart-source">Complete outcome years ${completeTimeline[0]?.year}–${completeTimeline.at(-1)?.year}. ${excludedYears} are excluded because applications remain pending.</p>
      </article>
      <div class="metric-stack">
        <div><small>Compared with art unit</small><strong>+${(metrics.grant_ratio - profile.context_comparison[1].grant_ratio).toFixed(1)} pts</strong><p>${profile.context_comparison[1].grant_ratio.toFixed(1)}% observed art-unit grant ratio</p></div>
        <div><small>Most common first-action rejection</small><strong>§ 103</strong><p>${profile.rejection_timeline[0].section_103.toFixed(1)}% of observed first office actions</p></div>
        <div><small>Data through</small><strong>${escapeHtml(displayDate(profile.data_recency))}</strong><p>Recent incomplete outcome years are omitted from the chart.</p></div>
      </div>
    </div>
    ${comparisonTable(profile)}
    ${section101YearlyChart(profile)}
    <div class="table-card">
      <div class="table-card-heading"><h3>Rejection pattern by office-action number</h3><p>Share of observed office actions that included each statutory rejection.</p></div>
      <div class="table-scroll"><table class="data-table"><thead><tr><th>OA #</th><th>Office actions</th><th>§ 101</th><th>§ 102</th><th>§ 103</th><th>§ 112</th></tr></thead><tbody>${rejectionRows}</tbody></table></div>
    </div>
    <article class="comparison-summary source-note">
      <h3>About this saved profile</h3>
      <p>Saved from PatentAgility’s public examiner profile on ${escapeHtml(displayDate(profile.snapshot_date))}. The source data includes office actions through ${escapeHtml(displayDate(profile.data_recency))}. ${Number(validation.family_validated_grants || metrics.granted).toLocaleString()} grant outcomes were matched to public patent-family records; ${Number(validation.office_action_only_signals || 0).toLocaleString()} additional office-action grant signal remains separate for review.</p>
      <p>These figures are estimates from public USPTO-related data and derived joins. They describe past records and do not predict an application result. <a href="${escapeHtml(profile.source_url)}" target="_blank" rel="noreferrer">Open the saved source profile</a>.</p>
    </article>`;
}

function renderFamilyHistory(result, payload) {
  const sources = loadedMatter.source_documents || [];
  const members = loadedMatter.family_members || [];
  const prosecution = loadedMatter.prosecution_history || [];
  const warnings = loadedMatter.family_data_warnings || [];
  const summary = result.summary || {};
  const diffByKey = new Map((result.amendment_diffs || []).map((diff) => [diff.key, diff]));
  const amendmentCount = prosecution.reduce((total, record) => total + record.snapshots.length, 0);
  const officeActionCount = prosecution.reduce((total, record) => total + record.events.filter((event) => event.type === "office_action").length, 0);
  const tracks = prosecution.map((record) => {
    const grantSource = sources.find((source) => source.document_number.includes(record.patent_number));
    const events = record.events.map((event) => {
      const snapshot = record.snapshots.find((item) => item.date === event.date);
      const tag = snapshot ? "button" : "div";
      const target = snapshot ? ` data-snapshot-target="${snapshotElementId(record, snapshot)}"` : "";
      return `<${tag} class="prosecution-event ${escapeHtml(event.type)}"${target}><span></span><small>${escapeHtml(event.date)}</small><strong>${escapeHtml(event.label)}</strong>${snapshot ? "<em>Open claim changes</em>" : ""}</${tag}>`;
    }).join("");
    return `<article class="prosecution-track"><header><div><small>${escapeHtml(record.label)}</small><h3>US ${escapeHtml(formatPatentNumber(record.patent_number))}</h3><p>Application ${escapeHtml(formatApplicationNumber(record.application_number))} · filed ${escapeHtml(record.filed)}</p></div><div class="track-actions"><strong>${record.events.length} events</strong>${grantSource ? `<a href="${escapeHtml(grantSource.url)}" target="_blank" rel="noreferrer">Official patent</a>` : ""}</div></header><div class="prosecution-events">${events}</div><div class="snapshot-list">${record.snapshots.map((snapshot) => renderAmendmentSnapshot(record, snapshot, diffByKey.get(amendmentSnapshotKey(record, snapshot)))).join("")}</div></article>`;
  }).join("");
  setResultHeading(`${members.length} related U.S. grants with ${amendmentCount} recorded amendments`, "Select an amendment event to open the saved claim changes. Confirm each change against the official file wrapper. The patent links below do not include the amendment documents.");
  resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("U.S. grants", members.length)}${stat("Amendments", amendmentCount)}${stat("Office actions", officeActionCount)}${stat("Independent claims", summary.claim_count || 0)}</div><section class="prosecution-review"><div class="section-heading compact"><div><h2>Amendments and examination events</h2></div></div>${tracks}</section><details class="secondary-section"><summary>View the U.S. family relationship</summary><div class="family-path">${members.map((member, index) => `<article><small>${escapeHtml(member.relationship)}</small><h3>${escapeHtml(member.document_number)}</h3><p>Application ${escapeHtml(formatApplicationNumber(member.application_number))}</p><p>Filed ${escapeHtml(member.filed)} · Granted ${escapeHtml(member.granted)}</p>${index === 0 ? '<span aria-hidden="true">continues as →</span>' : ""}</article>`).join("")}</div></details>${warnings.map((warning) => `<div class="data-warning"><strong>Source-data warning</strong><p>${escapeHtml(warning)}</p></div>`).join("")}<article class="comparison-summary source-note"><h3>Official patent documents</h3><p>${sources.map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.label)} · ${escapeHtml(source.document_number)}</a>`).join(" · ")}</p></article>`;
}

function snapshotElementId(record, snapshot) {
  return `snapshot-${record.application_number}-${snapshot.date}`.replace(/[^a-z0-9-]/gi, "-");
}

function renderAmendmentSnapshot(record, snapshot, diff) {
  const hasRedline = Boolean(diff?.segments?.length);
  const summary = `<ul>${snapshot.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>`;
  const badge = hasRedline ? '<strong class="redline-badge">Claim redline</strong>' : "";
  const redline = hasRedline ? renderClaimRedline(snapshot, diff) : "";
  return `<details id="${snapshotElementId(record, snapshot)}"><summary><span>${escapeHtml(snapshot.date)}</span>${escapeHtml(snapshot.title)}${badge}</summary>${summary}${redline}</details>`;
}

function renderClaimRedline(snapshot, diff) {
  const segments = diff.segments.map((segment) => {
    const className = segment.operation === "insert" ? "claim-insert" : segment.operation === "delete" ? "claim-delete" : "claim-equal";
    return `<span class="${className}">${escapeHtml(segment.text)}</span>`;
  }).join("");
  const summary = diff.summary || {};
  return `<section class="claim-redline-card" aria-label="Claim ${escapeHtml(snapshot.claim_number)} amendment redline"><header><div><small>Claim ${escapeHtml(snapshot.claim_number)}</small><h4>Amended language</h4></div><div class="redline-legend" aria-label="Redline legend"><span class="added">Added</span><span class="removed">Removed</span></div></header><p class="claim-redline-text">${segments}</p><footer><div><strong>${summary.inserted_tokens || 0}</strong> words added <span aria-hidden="true">·</span> <strong>${summary.deleted_tokens || 0}</strong> words removed</div><p>${escapeHtml(snapshot.diff_source || "Public amendment record")}. ${escapeHtml(snapshot.diff_note || "")}</p></footer></section>`;
}

function renderDifferenceText(diff, beforeText, afterText) {
  if (!diff?.segments?.length) {
    return `<span class="claim-delete">${escapeHtml(beforeText)}</span> <span class="claim-insert">${escapeHtml(afterText)}</span>`;
  }
  return diff.segments.map((segment) => {
    const className = segment.operation === "insert" ? "claim-insert" : segment.operation === "delete" ? "claim-delete" : "claim-equal";
    return `<span class="${className}">${escapeHtml(segment.text)}</span>`;
  }).join("");
}

function claimPairConclusion(row) {
  const changed = row.summary?.changed_limitations || 0;
  const added = row.summary?.added_limitations || 0;
  const removed = row.summary?.removed_limitations || 0;
  const parts = [];
  if (changed) parts.push(`${changed} modified`);
  if (added) parts.push(`${added} added`);
  if (removed) parts.push(`${removed} removed`);
  return parts.length ? `${parts.join(", ")} limitation ${parts.length === 1 && changed + added + removed === 1 ? "block" : "blocks"}` : "No material limitation-block change";
}

function renderFamilyClaims(result, payload) {
  const summary = result.summary || {};
  const documents = result.documents || [];
  const alignments = result.alignments || [];
  const rows = alignments.map((row) => {
    const pair = [row.baseline_claim, row.comparison_claim];
    const changed = (row.shared || []).filter((item) => item.changed).map((item, index) => `<article class="limitation-change modified"><header><span>Modified block ${index + 1}</span><small>Claim ${item.baseline_claim_number} → claim ${item.comparison_claim_number}</small></header><p>${renderDifferenceText(item.diff, item.left_text, item.right_text)}</p></article>`).join("");
    const added = (row.added || []).map((item, index) => `<article class="limitation-change added"><header><span>Added block ${index + 1}</span><small>${escapeHtml(documents[1]?.document_number || "Later grant")} · claim ${item.claim_number}</small></header><p><span class="claim-insert">${escapeHtml(item.text)}</span></p></article>`).join("");
    const removed = (row.removed || []).map((item, index) => `<article class="limitation-change removed"><header><span>Removed block ${index + 1}</span><small>${escapeHtml(documents[0]?.document_number || "Earlier grant")} · claim ${item.claim_number}</small></header><p><span class="claim-delete">${escapeHtml(item.text)}</span></p></article>`).join("");
    const changes = changed + added + removed || '<p class="no-change">No added, removed, or materially modified limitation block was identified.</p>';
    const fullClaims = pair.map((claim, index) => claim ? `<article><small>${escapeHtml(documents[index]?.document_number || claim.document_number)}</small><h4>Claim ${claim.claim_number}</h4><ol class="limitation-list">${claim.limitations.map((limitation, limitationIndex) => `<li><span>${String(limitationIndex + 1).padStart(2, "0")}</span><p>${escapeHtml(limitation)}</p></li>`).join("")}</ol></article>` : '<article class="missing-claim">No independent claim in this position.</article>').join("");
    return `<article class="claim-alignment"><header><div><small>Independent claim pair ${row.position}</small><h3>${claimPairConclusion(row)}</h3></div><p>${pair.filter(Boolean).map((claim, index) => `${escapeHtml(documents[index]?.document_number || claim.document_number)} claim ${claim.claim_number}`).join(" compared with ")}</p></header><details class="claim-changes"><summary>Review changed limitation blocks</summary><div class="limitation-changes">${changes}</div></details><details class="full-claims"><summary>Read the complete claims</summary><div class="full-claim-grid">${fullClaims}</div></details></article>`;
  }).join("");
  const changeCount = (summary.changed_limitations || 0) + (summary.added_limitations || 0) + (summary.removed_limitations || 0);
  setResultHeading(`${changeCount} limitation changes across ${summary.comparison_rows || 0} claim pairs`, "Added language is underlined. Removed language is struck through. Open the complete claims only when you need the surrounding limitations.");
  resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Claim pairs", summary.comparison_rows || 0)}${stat("Modified", summary.changed_limitations || 0)}${stat("Added", summary.added_limitations || 0)}${stat("Removed", summary.removed_limitations || 0)}</div><div class="comparison-legend"><span class="legend-add">Added</span><span class="legend-change">Modified block</span><span class="legend-remove">Removed</span></div><div class="claim-alignments">${rows}</div>`;
}

function renderUnclaimed(result, payload) {
  const items = result.concepts || [];
  setResultHeading(items.length ? `${items.length} disclosed concepts compared with the U.S. family` : "No disclosed concept was available", items.length ? "Review each concept beside its closest cited claim language. The results do not determine whether the concept is claimed." : "No disclosed concept was available for comparison.");
  const concepts = items.map((item, index) => {
    const closestMatch = item.closest_match
      ? `<strong>${escapeHtml(item.closest_match.document_number)}</strong><p>“${escapeHtml(item.closest_match.passage)}”</p>`
      : "<p>No family-claim match was returned.</p>";
    return `<article class="coverage-item">
      <span class="coverage-state">Concept ${index + 1}</span>
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="coverage-evidence-grid">
          <section><small>Specification evidence</small><p>${escapeHtml(item.evidence)}</p></section>
          <section><small>Closest family claim</small>${closestMatch}</section>
        </div>
      </div>
    </article>`;
  }).join("");
  resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Concepts reviewed", items.length)}${stat("Family claims", result.claim_count || 0)}</div><div class="coverage-list">${concepts}</div>`;
}

function renderArtUnit() {
  const classifications = loadedMatter.classification_records || [];
  const profile = loadedMatter.examiner_profile;
  const prediction = loadedMatter.art_unit_prediction_example;
  if (!profile) {
    setResultHeading("Official classification context", "The loaded grant provides classification evidence but no saved examiner-routing profile.");
    resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Classifications", classifications.length)}${stat("Scheme", "CPC")}</div><div class="prediction-list">${classifications.map((item, index) => `<article class="prediction-row"><span class="prediction-rank">${String(index + 1).padStart(2, "0")}</span><div><h3>${escapeHtml(item.code)}</h3><p>${escapeHtml(item.description)}</p></div><div class="prediction-evidence"><strong>${escapeHtml(item.scheme)} record</strong></div></article>`).join("")}</div>`;
    return;
  }
  if (!prediction) {
    setResultHeading(`The issued patent was routed to Art Unit ${profile.art_unit}`, `Examiner ${profile.name} handled the saved record. No prediction is available for comparison.`);
    resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Observed art unit", profile.art_unit)}${stat("Classifications", classifications.length)}</div>`;
    return;
  }
  setResultHeading(`Art Unit ${prediction.predictions[0].art_unit} ranks first; the issued patent was routed to ${profile.art_unit}`, "Compare the ranked candidates with the official CPC classifications. The ranking does not predict the USPTO's assignment.");
  const predictions = prediction.predictions.map((item, index) => `<article class="prediction-row"><span class="prediction-rank">${String(index + 1).padStart(2, "0")}</span><div><h3>Art Unit ${escapeHtml(item.art_unit)}</h3><p>${escapeHtml(item.group)}</p><small>Technology Center ${escapeHtml(item.tech_center)}</small></div><div class="prediction-evidence"><strong>${Number(item.probability).toFixed(1)}%</strong><span>model score</span></div></article>`).join("");
  const classificationRows = classifications.map((item) => `<tr><th scope="row">${escapeHtml(item.code)}</th><td>${escapeHtml(item.scheme)}</td><td>${escapeHtml(item.description)}</td></tr>`).join("");
  resultsContent.innerHTML = `<div class="summary-band compact-facts">${stat("Top candidate", `AU ${prediction.predictions[0].art_unit}`)}${stat("Ranking score", `${prediction.predictions[0].probability.toFixed(1)}%`)}${stat("Classes reviewed", prediction.class_count)}${stat("Observed unit", profile.art_unit)}</div><div class="routing-comparison"><article class="routing-card"><small>Ranked from invention text</small><h3>Art Unit ${escapeHtml(prediction.predictions[0].art_unit)}</h3><p>${escapeHtml(prediction.predictions[0].group)}</p></article><article class="routing-card observed"><small>Observed on the issued patent</small><h3>Art Unit ${escapeHtml(profile.art_unit)}</h3><p>${escapeHtml(profile.group)}</p><p>Examiner ${escapeHtml(profile.name)}</p></article></div><details class="secondary-section"><summary>View all ranked candidates</summary><div class="prediction-list">${predictions}</div></details><div class="table-card"><div class="table-card-heading"><h3>Official CPC classifications</h3><p>Use the grant classifications to review whether the ranked routing is plausible.</p></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Code</th><th>Scheme</th><th>Description</th></tr></thead><tbody>${classificationRows}</tbody></table></div></div>`;
}

function renderError(error) {
  progressPanel.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
  analysisColumn.classList.add("has-result");
  analysisColumn.classList.remove("is-editing", "is-preparing");
  const adjustInput = document.getElementById("adjust-input");
  adjustInput.hidden = false;
  adjustInput.textContent = "Adjust input";
  const overloaded = error.status === 429;
  setResultHeading(overloaded ? "The review is still busy" : "Analysis could not complete", overloaded ? "The service could not start this review within two minutes." : "No reviewable result was produced.");
  resultsContent.innerHTML = `<div class="error-box"><strong>${overloaded ? "Please try again shortly" : "Please try the review again"}</strong><p>${overloaded ? "Your input is still available, so you can run the review again without re-entering it." : "If the problem continues, preserve your input and contact your administrator."}</p></div>`;
  resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showDataHandling() {
  document.getElementById("dialog-title").textContent = "Data handling";
  document.getElementById("dialog-content").innerHTML = `<p>The selected patent and completed reviews stay in this browser so you can resume after a refresh. Use “Clear browser data” to remove them.</p><p>The built-in example uses saved USPTO documents. Confirm material findings against the official record.</p>`;
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
  const showLookupButton = event.target.closest("[data-show-patent-lookup]");
  if (showLookupButton) {
    const variant = showLookupButton.closest("[data-record-loader-host]")?.dataset.variant || "overview";
    patentLookupExpanded = true;
    renderPatentLoaders();
    document.querySelector(`[data-record-loader-host][data-variant="${variant}"] [data-lookup-identifier]`)?.focus();
  }
  const hideLookupButton = event.target.closest("[data-hide-patent-lookup]");
  if (hideLookupButton) {
    patentLookupExpanded = false;
    renderPatentLoaders();
  }
  const changeButton = event.target.closest("[data-change-patent]");
  if (changeButton) {
    clearLoadedPatent();
    document.querySelector('[data-record-loader-host][data-variant="overview"] [data-load-demo-record]')?.focus();
  }
  const snapshotButton = event.target.closest("[data-snapshot-target]");
  if (snapshotButton) {
    const snapshot = document.getElementById(snapshotButton.dataset.snapshotTarget);
    if (snapshot) {
      snapshot.open = true;
      snapshot.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  const savedAnalysisButton = event.target.closest("[data-analysis-id]");
  if (savedAnalysisButton) openSavedAnalysis(savedAnalysisButton.dataset.analysisId);
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-lookup-identifier]")) return;
  event.preventDefault();
  lookupPatent(event.target.closest("[data-patent-record-loader]"));
});
document.querySelector(".brand").addEventListener("click", (event) => { event.preventDefault(); showOverview(); });
document.getElementById("data-handling").addEventListener("click", showDataHandling);
document.getElementById("clear-browser-data").addEventListener("click", clearBrowserData);
document.getElementById("adjust-input").addEventListener("click", () => {
  const editing = analysisColumn.classList.toggle("is-editing");
  const labels = activeToolKey === "support"
    ? ["Hide limitations", "Change limitations"]
    : ["Hide search", "Change search"];
  document.getElementById("adjust-input").textContent = editing ? labels[0] : labels[1];
  if (editing) toolForm.scrollIntoView({ behavior: "smooth", block: "start" });
});
clearHistoryButton.addEventListener("click", clearAnalysisHistory);
document.getElementById("mobile-menu").addEventListener("click", () => {
  const expanded = sidebar.classList.toggle("is-open");
  document.getElementById("mobile-menu").setAttribute("aria-expanded", String(expanded));
});
toolForm.addEventListener("submit", runAnalysis);

async function initializeApp() {
  await restoreBrowserState();
  const initialHash = location.hash.slice(1);
  if (tools[initialHash]) openTool(initialHash); else showOverview();
}

initializeApp();
