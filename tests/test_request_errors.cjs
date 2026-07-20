const assert = require("node:assert/strict");
const test = require("node:test");

const {
  apiErrorMessage,
  networkErrorMessage,
  validatePatentIdentifier,
} = require("../web/request_errors.js");

test("patent identifiers explain the expected format before a request", () => {
  assert.equal(
    validatePatentIdentifier("patent", "banana"),
    "That does not look like a U.S. patent number. Enter 6 to 8 digits, for example 12,345,678.",
  );
  assert.equal(
    validatePatentIdentifier("application", "18/123"),
    "That does not look like a U.S. application number. Enter 8 digits, for example 18/456,219.",
  );
  assert.equal(validatePatentIdentifier("patent", "12,345,678"), null);
  assert.equal(validatePatentIdentifier("application", "18/456,219"), null);
});

test("an unreachable service produces an actionable message", () => {
  assert.equal(
    networkErrorMessage(),
    "PatentAgility cannot reach the local service. Confirm the application is running, then try again.",
  );
});

test("USPTO lookup failures preserve their distinct causes", () => {
  assert.equal(
    apiErrorMessage(503, { error: "patent_data_unconfigured" }),
    "Patent lookup is not configured yet. A USPTO Open Data Portal API key is required.",
  );
  assert.equal(
    apiErrorMessage(502, { error: "patent_data_unavailable" }),
    "USPTO could not find or retrieve that record. Check the number and try again.",
  );
  assert.equal(
    apiErrorMessage(400, {
      error: "invalid_request",
      message: "identifier is not a valid U.S. patent number",
    }),
    "identifier is not a valid U.S. patent number",
  );
});
