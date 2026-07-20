const assert = require("node:assert/strict");
const test = require("node:test");

const errors = require("../web/request_errors.js");
const { createRequestClient } = require("../web/request_client.js");

function response(status, body = {}, retryAfter = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => name === "Retry-After" ? retryAfter : null },
    json: async () => body,
  };
}

test("capacity responses keep waiting for the same logical request", async () => {
  const responses = [
    response(429, {}, "1"),
    response(429, {}, "1"),
    response(429, {}, "1"),
    response(200, { result: "ok" }),
  ];
  const requests = [];
  const waits = [];
  const retries = [];
  const client = createRequestClient({
    errors,
    fetchImpl: async (_url, options) => {
      requests.push(options);
      return responses.shift();
    },
    wait: async (milliseconds) => waits.push(milliseconds),
    random: () => 0.4,
    createRequestId: () => "request-123",
    onRetry: (retry) => retries.push(retry),
  });

  const result = await client.requestJson("/analysis", { claim: "text" });

  assert.deepEqual(result, { result: "ok" });
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map((request) => request.headers["X-Request-ID"]), [
    "request-123",
    "request-123",
    "request-123",
    "request-123",
  ]);
  assert.deepEqual(waits, [1100, 1100, 1100]);
  assert.deepEqual(retries, [
    { attempt: 1, waitMilliseconds: 1100, waitedMilliseconds: 0 },
    { attempt: 2, waitMilliseconds: 1100, waitedMilliseconds: 1100 },
    { attempt: 3, waitMilliseconds: 1100, waitedMilliseconds: 2200 },
  ]);
});

test("capacity retries stop when the total wait budget is exhausted", async () => {
  let requestCount = 0;
  const waits = [];
  const client = createRequestClient({
    errors,
    fetchImpl: async () => {
      requestCount += 1;
      return response(429, {}, "1");
    },
    wait: async (milliseconds) => waits.push(milliseconds),
    random: () => 0,
    createRequestId: () => "request-456",
  });

  await assert.rejects(
    client.requestJson("/analysis", {}, { maxWaitMilliseconds: 2500 }),
    (error) => error.status === 429 && error.retryAfter === "1" && error.waitedMilliseconds === 2000,
  );
  assert.equal(requestCount, 3);
  assert.deepEqual(waits, [1000, 1000]);
});

test("invalid requests fail without retrying", async () => {
  let requestCount = 0;
  const client = createRequestClient({
    errors,
    fetchImpl: async () => {
      requestCount += 1;
      return response(400, { message: "Bad input" });
    },
    wait: async () => assert.fail("400 responses must not be retried"),
    createRequestId: () => "request-789",
  });

  await assert.rejects(client.requestJson("/analysis", {}), /Bad input/);
  assert.equal(requestCount, 1);
});
