import { Container } from "@cloudflare/containers";

const DEMO_INSTANCE = "author-demo";
const ANALYSIS_ROUTES = new Set([
  "/v1/patents/lookup",
  "/v1/support/search",
  "/v1/claims/antecedent",
  "/v1/claims/diagram",
  "/v1/claims/diff",
  "/v1/family/claims/compare",
  "/v1/family/coverage",
]);

export class PatentAgilityContainer extends Container {
  defaultPort = 8000;
  sleepAfter = "15m";
  enableInternet = true;

  envVars = {
    HF_HOME: "/opt/patentagility/huggingface",
    HF_HUB_OFFLINE: "1",
    MKL_NUM_THREADS: "2",
    OMP_NUM_THREADS: "2",
    PATENTAGILITY_CACHE_DIR: "/opt/patentagility",
    PATENTAGILITY_DEVICE: "cpu",
    PATENTAGILITY_HOST: "0.0.0.0",
    PATENTAGILITY_HTTP_TIMEOUT_SECONDS: "300",
    PATENTAGILITY_MODEL_PROFILE: "throughput",
    PATENTAGILITY_PORT: "8000",
    PATENTAGILITY_REQUEST_TIMEOUT_SECONDS: "240",
    PATENTAGILITY_SHUTDOWN_TIMEOUT_SECONDS: "180",
    PATENTAGILITY_SPACY_MODEL: "en_core_web_sm",
    PATENTAGILITY_WEB_THREADS: "32",
    PATENTAGILITY_WEB_WORKERS: "1",
    TOKENIZERS_PARALLELISM: "false",
    TRANSFORMERS_OFFLINE: "1",
  };
}

function withDemoHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Robots-Tag", "noindex, nofollow");

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function jsonResponse(body, status, headers = {}) {
  return withDemoHeaders(
    Response.json(body, {
      status,
      headers,
    }),
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === "/metrics") {
      return jsonResponse({ error: "not_found" }, 404);
    }

    if (pathname.startsWith("/app/")) {
      url.pathname = pathname.slice("/app".length);
      return withDemoHeaders(await env.ASSETS.fetch(new Request(url, request)));
    }

    if (pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    if (!ANALYSIS_ROUTES.has(pathname)) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "method_not_allowed" }, 405, {
        Allow: "POST",
      });
    }

    const { success } = await env.ANALYSIS_RATE_LIMITER.limit({
      key: "analysis",
    });
    if (!success) {
      return jsonResponse(
        {
          error: "service_busy",
          message: "The service is handling several requests. Retrying shortly.",
        },
        429,
        { "Retry-After": "10" },
      );
    }

    const container = env.PATENT_AGILITY.getByName(DEMO_INSTANCE);
    return withDemoHeaders(await container.fetch(request));
  },
};
