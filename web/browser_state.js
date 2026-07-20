(() => {
  const DATABASE_NAME = "patentagility-review";
  const DATABASE_VERSION = 1;
  const WORKSPACE_STORE = "workspace";
  const ANALYSIS_STORE = "analyses";
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

  window.PatentAgilityState = Object.freeze({
    databaseName: DATABASE_NAME,
    getCurrentMatter,
    saveCurrentMatter,
    clearCurrentMatter,
    saveAnalysis,
    listAnalyses,
    clearAnalyses
  });
})();
