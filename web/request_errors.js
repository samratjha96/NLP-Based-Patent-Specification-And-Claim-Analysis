(function exposeRequestErrors(root, factory) {
  const helpers = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = helpers;
  root.PatentAgilityErrors = helpers;
})(typeof globalThis !== "undefined" ? globalThis : window, function createHelpers() {
  function validatePatentIdentifier(identifierType, rawIdentifier) {
    const digits = String(rawIdentifier || "").replace(/\D/g, "");
    if (identifierType === "application" && digits.length !== 8) {
      return "That does not look like a U.S. application number. Enter 8 digits, for example 18/456,219.";
    }
    if (identifierType === "patent" && (digits.length < 6 || digits.length > 8)) {
      return "That does not look like a U.S. patent number. Enter 6 to 8 digits, for example 12,345,678.";
    }
    return null;
  }

  function networkErrorMessage() {
    return "PatentAgility could not connect. Check your connection and try again.";
  }

  function apiErrorMessage(status, data) {
    if (data && data.error === "patent_data_unconfigured") {
      return "Public patent lookup is not available right now. Try again later.";
    }
    if (data && data.error === "patent_data_unavailable") {
      return "USPTO could not find or retrieve that record. Check the number and try again.";
    }
    if (data && data.error === "invalid_request" && data.message) return data.message;
    if (status === 429) return "The service is at capacity. Wait a moment and try again.";
    if (status === 504) return "The analysis took too long to finish. Try the request again.";
    if (data && data.message) return data.message;
    return `The request could not be completed (HTTP ${status}).`;
  }

  return {
    apiErrorMessage,
    networkErrorMessage,
    validatePatentIdentifier,
  };
});
