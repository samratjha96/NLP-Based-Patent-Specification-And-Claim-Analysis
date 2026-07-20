(function exposeRequestClient(root, factory) {
  const client = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = client;
  root.PatentAgilityRequestClient = client;
})(typeof globalThis !== "undefined" ? globalThis : window, function createClientModule() {
  function retryDelayMilliseconds(retryAfter, random) {
    const parsedSeconds = Number.parseFloat(retryAfter);
    const seconds = Number.isFinite(parsedSeconds) && parsedSeconds >= 0 ? Math.min(parsedSeconds, 30) : 2;
    const baseMilliseconds = seconds * 1000;
    return Math.ceil(baseMilliseconds + baseMilliseconds * 0.25 * random());
  }

  function createRequestClient({
    errors,
    fetchImpl = globalThis.fetch,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    random = Math.random,
    createRequestId = () => globalThis.crypto.randomUUID(),
    onRetry = () => {},
  }) {
    async function requestJson(url, payload, { maxRetries = 2 } = {}) {
      const requestId = createRequestId();
      for (let attempt = 0; ; attempt += 1) {
        let response;
        try {
          response = await fetchImpl(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Request-ID": requestId },
            body: JSON.stringify(payload),
          });
        } catch (cause) {
          const error = new Error(errors.networkErrorMessage(), { cause });
          error.kind = "network";
          throw error;
        }

        const data = await response.json().catch(() => null);
        const retryAfter = response.headers.get("Retry-After");
        if (response.status === 429 && attempt < maxRetries) {
          const waitMilliseconds = retryDelayMilliseconds(retryAfter, random);
          onRetry({ attempt: attempt + 1, maxRetries, waitMilliseconds });
          await wait(waitMilliseconds);
          continue;
        }
        if (!response.ok) {
          const error = new Error(errors.apiErrorMessage(response.status, data));
          error.status = response.status;
          error.retryAfter = retryAfter;
          throw error;
        }
        return data;
      }
    }

    return { requestJson };
  }

  return { createRequestClient, retryDelayMilliseconds };
});
