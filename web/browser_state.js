(() => {
  const DATABASE_NAME = "patentagility-review";
  const DATABASE_VERSION = 2;
  const WORKSPACE_STORE = "workspace";
  const ANALYSIS_STORE = "analyses";
  const PREPARED_REVIEW_STORE = "preparedReviews";
  let databasePromise;

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function transactionComplete(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  function openDatabase() {
    if (!databasePromise) {
      databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
        request.onupgradeneeded = () => {
          const database = request.result;
          if (!database.objectStoreNames.contains(WORKSPACE_STORE)) {
            database.createObjectStore(WORKSPACE_STORE);
          }
          if (!database.objectStoreNames.contains(ANALYSIS_STORE)) {
            const analyses = database.createObjectStore(ANALYSIS_STORE, { keyPath: "id" });
            analyses.createIndex("createdAt", "createdAt");
          }
          if (!database.objectStoreNames.contains(PREPARED_REVIEW_STORE)) {
            const reviews = database.createObjectStore(PREPARED_REVIEW_STORE, { keyPath: "cacheKey" });
            reviews.createIndex("recordId", "recordId");
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return databasePromise;
  }

  async function getCurrentMatter() {
    const database = await openDatabase();
    return (await requestResult(database.transaction(WORKSPACE_STORE).objectStore(WORKSPACE_STORE).get("currentMatter"))) || null;
  }

  async function saveCurrentMatter(matter) {
    const database = await openDatabase();
    const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
    transaction.objectStore(WORKSPACE_STORE).put(matter, "currentMatter");
    return transactionComplete(transaction);
  }

  async function clearCurrentMatter() {
    const database = await openDatabase();
    const transaction = database.transaction(WORKSPACE_STORE, "readwrite");
    transaction.objectStore(WORKSPACE_STORE).delete("currentMatter");
    return transactionComplete(transaction);
  }

  async function saveAnalysis(analysis) {
    const database = await openDatabase();
    const transaction = database.transaction(ANALYSIS_STORE, "readwrite");
    transaction.objectStore(ANALYSIS_STORE).put(analysis);
    return transactionComplete(transaction);
  }

  async function listAnalyses(limit = 12) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const analyses = [];
      const request = database.transaction(ANALYSIS_STORE).objectStore(ANALYSIS_STORE).index("createdAt").openCursor(null, "prev");
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor || analyses.length === limit) {
          resolve(analyses);
          return;
        }
        analyses.push(cursor.value);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function clearAnalyses() {
    const database = await openDatabase();
    const transaction = database.transaction(ANALYSIS_STORE, "readwrite");
    transaction.objectStore(ANALYSIS_STORE).clear();
    return transactionComplete(transaction);
  }

  async function savePreparedReview(review) {
    const database = await openDatabase();
    const transaction = database.transaction(PREPARED_REVIEW_STORE, "readwrite");
    transaction.objectStore(PREPARED_REVIEW_STORE).put(review);
    return transactionComplete(transaction);
  }

  async function getPreparedReview(cacheKey) {
    const database = await openDatabase();
    return (await requestResult(database.transaction(PREPARED_REVIEW_STORE).objectStore(PREPARED_REVIEW_STORE).get(cacheKey))) || null;
  }

  async function listPreparedReviews(recordId) {
    const database = await openDatabase();
    return requestResult(database.transaction(PREPARED_REVIEW_STORE).objectStore(PREPARED_REVIEW_STORE).index("recordId").getAll(recordId));
  }

  async function deletePreparedReviews(cacheKeys) {
    if (!cacheKeys.length) return;
    const database = await openDatabase();
    const transaction = database.transaction(PREPARED_REVIEW_STORE, "readwrite");
    const store = transaction.objectStore(PREPARED_REVIEW_STORE);
    cacheKeys.forEach((cacheKey) => store.delete(cacheKey));
    return transactionComplete(transaction);
  }

  async function clearAllData() {
    const database = await openDatabase();
    const transaction = database.transaction(
      [WORKSPACE_STORE, ANALYSIS_STORE, PREPARED_REVIEW_STORE],
      "readwrite"
    );
    transaction.objectStore(WORKSPACE_STORE).clear();
    transaction.objectStore(ANALYSIS_STORE).clear();
    transaction.objectStore(PREPARED_REVIEW_STORE).clear();
    return transactionComplete(transaction);
  }

  window.PatentAgilityState = Object.freeze({
    databaseName: DATABASE_NAME,
    getCurrentMatter,
    saveCurrentMatter,
    clearCurrentMatter,
    saveAnalysis,
    listAnalyses,
    clearAnalyses,
    savePreparedReview,
    getPreparedReview,
    listPreparedReviews,
    deletePreparedReviews,
    clearAllData
  });
})();
