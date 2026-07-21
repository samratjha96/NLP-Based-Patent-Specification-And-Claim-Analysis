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

test("the built-in USPTO patent can drive every workflow without USPTO access", () => {
  const record = loadDemoRecord();

  assert.equal(record.is_demo, true);
  assert.equal(record.patent_number, "9922200");
  assert.equal(record.application_number, "14319969");
  assert.equal(record.title, "Securely storing content within public clouds");
  assert.match(record.source, /USPTO Patent Public Search/i);
  assert.match(record.specification_text, /secure enclave/i);
  assert.match(record.specification_text, /processor-specific public/i);
  assert.match(record.specification_text, /biggest barrier to public cloud adoption/i);
  assert.match(record.specification_text, /\(40\).*?\n\n\(41\)/s);
  assert.match(record.claims_text, /securely storing content in a cloud/i);
  assert.match(record.principal_claim_text, /^1\. A method being performed/);
  assert.doesNotMatch(record.principal_claim_text, /\n2\./);
  assert.ok(record.specification_text.length > 25_000);
  assert.ok(record.claims_text.length > 5_000);
  assert.equal(record.review_examples.support_queries.length, 3);
  assert.equal(record.review_examples.examiner_query, "Samson Lemma");
  assert.equal(record.assistant_examiner, "Narciso Victoria");
  assert.equal(record.demo_results, undefined);
  assert.deepEqual(Array.from(record.family_members, (member) => member.patent_number), ["9922200", "10831913"]);
  assert.equal(record.family_events.length, 6);
  assert.match(record.family_claims[0].claim_text, /secure enclave capability/i);
  assert.match(record.family_claims[0].claim_text, /receiving, from the content owner, encrypted content/i);
  assert.match(record.family_claims[1].claim_text, /providing one or more processors/i);
  assert.ok(record.source_documents.every((document) => document.url.startsWith("https://image-ppubs.uspto.gov/")));
});

test("the example views use saved USPTO facts instead of synthetic metrics", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8");

  assert.doesNotMatch(source, /synthetic|illustrative|71\.4%|18,420/i);
  assert.match(source, /loadedMatter\.family_events/);
  assert.match(source, /loadedMatter\.family_claims/);
  assert.match(source, /loadedMatter\.source_documents/);
  assert.match(source, /matter\.is_demo \? demoRecord : matter/);
});
