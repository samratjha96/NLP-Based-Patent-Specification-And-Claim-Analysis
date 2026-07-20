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

test("capacity responses wait and retry the same logical request", async () => {
  const responses = [response(429, {}, "2"), response(200, { result: "ok" })];
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
  assert.equal(requests.length, 2);
  assert.equal(requests[0].headers["X-Request-ID"], "request-123");
  assert.equal(requests[1].headers["X-Request-ID"], "request-123");
  assert.deepEqual(waits, [2200]);
  assert.deepEqual(retries, [{ attempt: 1, maxRetries: 2, waitMilliseconds: 2200 }]);
});

test("capacity retries stop after two delayed attempts", async () => {
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
    client.requestJson("/analysis", {}),
    (error) => error.status === 429 && error.retryAfter === "1",
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
