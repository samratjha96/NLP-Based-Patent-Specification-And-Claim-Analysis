const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadDemoRecord() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "demo_record.js"), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(source, sandbox);
  return sandbox.window.PatentAgilityDemoRecord;
}

test("the built-in patent example can drive every workflow without USPTO access", () => {
  const record = loadDemoRecord();

  assert.equal(record.is_demo, true);
  assert.match(record.source, /illustrative/i);
  assert.match(record.specification_text, /temperature compensation/i);
  assert.match(record.specification_text, /network connectivity/i);
  assert.match(record.claims_text, /sensing system/i);
  assert.ok(record.specification_text.length > 1_000);
  assert.ok(record.claims_text.length > 300);
  assert.equal(record.review_examples.support_queries.length, 3);
  assert.equal(record.review_examples.examiner_query, "Art Unit 2123");
  assert.equal(record.demo_results.support.results.length, 3);
  assert.equal(record.demo_results.antecedent.summary.high, 1);
  assert.ok(record.demo_results.linguistic.segments.length >= 4);
});
