# PatentAgility

Patent review workspace for exploring specification support, claim language,
U.S. family scope, prosecution history, and examiner trends from a single
patent record.

The project began as experimental NLP work by [Kirk A. Sigmon](mailto:kirk.a.sigmon.th@dartmouth.edu). This checkout now includes a lawyer-facing web application, a local inference service, public patent-record lookup, production serving, and a Cloudflare deployment boundary.

> This is research software, not legal advice. Its results are review leads and navigation aids. Attorneys must verify every passage, claim comparison, prosecution event, classification, and conclusion against the authoritative record.

## What it does

The application keeps one U.S. patent record available across eight review tools:

| Review | What it shows | Execution path |
|---|---|---|
| Claim Amendment History | Parent and continuation events, amendment snapshots, and claim changes | Family record plus claim diff service |
| Compare U.S. Family Claims | Added, removed, and modified limitation blocks across granted family claims | Local claim alignment |
| Find Unclaimed Subject Matter | Specification concepts that appear weakly covered across the family | Bounded semantic-analysis queue |
| Spec Support | Ranked passages and sentence-level evidence for each limitation | Batched local retrieval |
| Antecedent Basis | Definite references without a likely introduction and unused introductions | spaCy claim analysis |
| Linguistic Claim Analysis | Actions, objects, details, alternatives, and dependencies in a claim | Structured claim segmentation and SVG output |
| Art Unit Predictor | Observed art-unit context and official CPC classification evidence | Record-backed review |
| Examiner Analytics | Grant, office-action, rejection, pendency, and yearly trend views | Saved examiner profile |

The interface is record-oriented rather than a set of disconnected text boxes. Open a patent once, then move between reviews without re-entering the identifier. The browser stores the selected record, prepared reviews, and completed analyses in IndexedDB. Overloaded requests retry automatically in the browser, so a user does not need to resubmit a review manually.

## Quick start

### Requirements

- Python 3.12
- [`uv`](https://docs.astral.sh/uv/)
- A machine that can run the local embedding model; CPU is supported
- Node.js and npm only if you want to validate or deploy the Cloudflare Worker

### Install

```bash
git clone https://github.com/samratjha96/NLP-Based-Patent-Specification-And-Claim-Analysis.git
cd NLP-Based-Patent-Specification-And-Claim-Analysis

uv venv --python 3.12
uv pip install -r requirements.txt
uv pip install -r requirements-dev.txt
uv run python -m spacy download en_core_web_sm
```

The application uses `en_core_web_sm` by default. Install `en_core_web_trf` if you want to run the transformer-based claim pipeline directly:

```bash
uv run python -m spacy download en_core_web_trf
```

Model caches default to `~/.cache/patentagility`. Set `PATENTAGILITY_CACHE_DIR` to move the cache, or set `PATENTAGILITY_HF_CACHE_DIR` and `PATENTAGILITY_SPACY_CACHE_DIR` independently.

### Run the local application

The throughput profile is the smallest practical profile for a local product walkthrough:

```bash
PATENTAGILITY_MODEL_PROFILE=throughput \
PATENTAGILITY_SPACY_MODEL=en_core_web_sm \
uv run python service.py
```

Open <http://127.0.0.1:8000/> and choose **Open US 9,922,200** for the complete built-in walkthrough. The record opens all eight review surfaces, including family history, claim comparisons, coverage review, examiner analytics, and art-unit context.

For the default quality-oriented profile:

```bash
PATENTAGILITY_MODEL_PROFILE=balanced uv run python service.py
```

Run the test suite with:

```bash
uv run pytest
uv run ruff check .
```

## Patent records and data paths

The web application accepts a U.S. patent number or U.S. application number from the overview. The same record remains selected while the user moves between tools.

- Without `USPTO_API_KEY`, the service resolves public patent records through Google Patents and extracts structured specification and claim text.
- With `USPTO_API_KEY`, the service uses the USPTO Open Data Portal, resolves the application, downloads the earliest file-wrapper specification, and extracts its text.
- The lookup response returns record metadata and character counts, not the full specification or claim text.
- Subsequent analysis requests use the server-side record cache, so a specification is loaded and indexed once for repeated searches.
- The public-record cache is process-local and bounded. A process restart or eviction requires the record to be loaded again.

Set the credential only when using the USPTO path:

```bash
export USPTO_API_KEY="your-key"
uv run python service.py
```

The application keeps the source URL, identifier, claims, classification data, and review context together. It does not present a text-match score as a legal conclusion: support results are passages to inspect, coverage results are review candidates, and observed examiner data is not a prediction for a new application.

## Architecture

```text
+----------------------+       +-----------------------------+
| Browser               |       | Cloudflare Worker           |
| - review workspace    | ----> | - static assets             |
| - IndexedDB state     |       | - POST route allowlist      |
| - automatic retries   |       | - edge rate limit           |
+----------------------+       +--------------+--------------+
                                                |
                                                v
                                 +-----------------------------+
                                 | Flask / Gunicorn service    |
                                 | - patent record loader      |
                                 | - claim and family tools    |
                                 | - health and metrics        |
                                 +--------------+--------------+
                                                |
                                                v
                                 +-----------------------------+
                                 | Bounded batch processor     |
                                 | - admission limit           |
                                 | - micro-batching             |
                                 | - request deadlines         |
                                 | - graceful queue drain      |
                                 +--------------+--------------+
                                                |
                           +--------------------+--------------------+
                           v                                         v
                +----------------------+                 +----------------------+
                | Local NLP models    |                 | Public patent data  |
                | embeddings, ranking |                 | or USPTO ODP         |
                +----------------------+                 +----------------------+
```

The local service exposes the frontend at `/` and analysis APIs under `/v1/`. The production configuration uses one Gunicorn worker by default because each worker owns its own model, index cache, and queue. Multiple model workers are possible only with explicit opt-in.

## API surface

All analysis endpoints accept `POST` with JSON and return JSON. Every response includes an `X-Request-ID`. The browser uses the same API surface as the local and Cloudflare deployments.

| Endpoint | Purpose |
|---|---|
| `POST /v1/patents/lookup` | Resolve a U.S. patent or application number |
| `POST /v1/support/search` | Search a specification for one or more limitations |
| `POST /v1/claims/antecedent` | Analyze antecedent-basis relationships |
| `POST /v1/claims/diagram` | Render a structured claim map |
| `POST /v1/claims/diff` | Compare before/after claim text |
| `POST /v1/family/claims/compare` | Align independent claims across a family |
| `POST /v1/family/coverage` | Compare specification concepts with family claims |
| `GET /health/live` | Process liveness |
| `GET /health/ready` | Queue readiness and admission state |
| `GET /metrics` | Queue, batch, timeout, cache, and process metrics |

Example support request using the text API directly:

```bash
curl http://127.0.0.1:8000/v1/support/search \
  -H 'Content-Type: application/json' \
  -d '{
    "patent_text": "The complete specification text...",
    "queries": [
      "a processor coupled to memory",
      "a rechargeable power source"
    ],
    "top_n": 10
  }'
```

For a loaded public record, use `record_id` instead of sending the specification again:

```json
{
  "record_id": "grant:9922200",
  "queries": ["a processor coupled to memory"],
  "top_n": 10
}
```

## Bounded inference and production serving

Support searches run through an in-process bounded queue. Requests arriving within a short window are combined into embedding and ranking batches. Repeated public patent indexes and repeated queries are deduplicated where possible.

When the queue is full, the service returns `429` with `Retry-After`. When work misses its request deadline, it returns `504`. On shutdown, new work is rejected, accepted work drains, and the process exits after the configured drain timeout. The queue is intentionally in-process and non-durable.

Start the tested one-server configuration with Gunicorn:

```bash
PATENTAGILITY_PORT=8000 scripts/start_production.sh
```

The defaults are one Gunicorn worker, 64 HTTP threads, one `throughput` model replica, and CPU execution. A second worker creates a second model and queue rather than sharing the first one.

The production load report is stored in [`data/benchmarks/production-server-benchmark.json`](data/benchmarks/production-server-benchmark.json). Reproduce the 60-second comparison with:

```bash
uv run python scripts/benchmark_production.py \
  --duration-seconds 60 \
  --concurrency 16 \
  --worker-counts 1 2
```

The tested one-worker run reached 254.38 requests per second after cold start, with a 1.45 GB peak process-tree RSS. The two-worker run was slower on this CPU and used about twice the memory. One worker is therefore the tested recommendation for the single-server deployment target.

## Model profiles

| Profile | Embedder | Reranker | Use |
|---|---|---|---|
| `balanced` | `Alibaba-NLP/gte-modernbert-base` | None | Default quality-oriented profile |
| `throughput` | `mixedbread-ai/mxbai-embed-xsmall-v1` | None | Local demos and higher request throughput |
| `baseline` | `BAAI/bge-m3` | `BAAI/bge-reranker-large` | Original retrieval behavior for comparison |

The retrieval benchmark is a prior-art retrieval proxy, not a complete evaluation of support inside a patent specification. Run it with:

```bash
mkdir -p data/benchmark outputs
curl -fL \
  https://huggingface.co/datasets/bhlim/patentmatch_for_finetuning/resolve/main/data/test-00000-of-00001.parquet \
  -o data/benchmark/patentmatch-test.parquet

uv run python benchmarks/benchmark_patentmatch.py \
  --dataset data/benchmark/patentmatch-test.parquet \
  --profile balanced \
  --sample-size 500 \
  --skip-reranker \
  --output outputs/patentmatch-balanced-500.json
```

Queue behavior can be exercised against the running service with:

```bash
uv run python -m benchmarks.load_http \
  --url http://127.0.0.1:8000 \
  --requests 16 \
  --concurrency 16
```

## Cloudflare deployment

The Worker in [`cloudflare/worker.js`](cloudflare/worker.js) serves `web/` as static assets and forwards only approved analysis `POST` routes to one sleeping container. Static page loads, JavaScript, CSS, the favicon, and unknown routes do not start the model container.

The Worker applies an edge rate limit of eight admissions per ten seconds. The service queue remains the exact in-process admission boundary. Both layers use `429` and `Retry-After`, and the browser retries automatically. The container sleeps after 15 minutes without an analysis request.

Install the JavaScript dependencies and validate the deployment without publishing:

```bash
npm ci
npx wrangler types
npx wrangler deploy --dry-run
```

Deploy with:

```bash
npx wrangler deploy
```

The Docker image preloads the CPU model and spaCy pipeline into `/opt/patentagility`, runs as a non-root user, and exposes `/health/ready` for the container health check. Cloudflare deployment configuration is intentionally CPU-only and uses one model worker.

## Configuration

The most useful runtime settings are:

| Variable | Default | Meaning |
|---|---:|---|
| `PATENTAGILITY_MODEL_PROFILE` | `balanced` in Flask, `throughput` in production script | Retrieval model profile |
| `PATENTAGILITY_SPACY_MODEL` | `en_core_web_sm` | Claim-analysis pipeline |
| `PATENTAGILITY_DEVICE` | Automatic locally, `cpu` in production script | Model device |
| `PATENTAGILITY_QUEUE_CAPACITY` | `32` | Maximum queued requests |
| `PATENTAGILITY_MAX_BATCH_SIZE` | `8` | Maximum requests per batch |
| `PATENTAGILITY_MAX_BATCH_CHARACTERS` | `4000000` | Maximum text cost per batch |
| `PATENTAGILITY_BATCH_WINDOW_MS` | `20` | Batch collection window |
| `PATENTAGILITY_REQUEST_TIMEOUT_SECONDS` | `120` | Request deadline |
| `PATENTAGILITY_RETRY_AFTER_SECONDS` | `2` | Retry hint for queue overload |
| `PATENTAGILITY_INDEX_CACHE_SIZE` | `4` | Public patent indexes kept in memory |
| `PATENTAGILITY_MAX_PATENT_CHARACTERS` | `2000000` | Maximum specification text per request |
| `PATENTAGILITY_MAX_QUERIES` | `64` | Maximum queries per support request |
| `PATENTAGILITY_EMBEDDING_BATCH_SIZE` | `256` | Device embedding batch size |
| `PATENTAGILITY_RERANKER_BATCH_SIZE` | `32` | Device reranker batch size |
| `PATENTAGILITY_WEB_WORKERS` | `1` | Gunicorn processes and model replicas |
| `PATENTAGILITY_WEB_THREADS` | `64` | HTTP threads per process |
| `PATENTAGILITY_SHUTDOWN_TIMEOUT_SECONDS` | `180` | Queue-drain timeout |
| `USPTO_API_KEY` | unset | Enables USPTO Open Data Portal retrieval |

## Troubleshooting

### The service says the model or spaCy pipeline is missing

Install the runtime dependencies and the configured spaCy model:

```bash
uv pip install -r requirements.txt
uv run python -m spacy download en_core_web_sm
```

### A lookup returns `502`

The requested public record or USPTO document could not be retrieved. Confirm the identifier type and number, then retry. For USPTO Open Data Portal retrieval, confirm that `USPTO_API_KEY` is set and valid. Public patent-number lookup does not require that key.

### A review returns `429`

The queue is full or the edge rate limiter has admitted too many requests. The browser retries automatically. API clients should honor `Retry-After` and retry the same request ID.

### A review returns `504`

The request exceeded `PATENTAGILITY_REQUEST_TIMEOUT_SECONDS`. Reduce the number or size of queries, use the throughput profile, or increase the deadline for a controlled server deployment.

### A page reload shows the patent but a new review cannot run

The browser can restore the selected record and completed results from IndexedDB, but the local server's full-text record cache is process-local. Run the lookup again after restarting or evicting the service cache.

## Limitations

- The review tools do not replace attorney judgment, claim construction, prosecution-history analysis, or a complete prior-art search.
- Public record lookup and server-side record caching depend on external patent-data availability.
- The queue is process-local and non-durable. It is designed for bounded work on one server, not distributed job execution.
- Examiner analytics and art-unit views describe the records available to their profiles; they do not predict the outcome of a new application.
- The retrieval benchmark is not a validation of legal support, written description, enablement, or infringement.
- Multi-worker deployments duplicate model memory and queues. Measure memory and throughput before enabling them.

## Repository layout

- `service.py` — Flask API, frontend serving, request validation, health, and metrics
- `core/` — patent loading, claim analysis, family comparison, retrieval, and queueing
- `web/` — browser workspace, request client, persistence, and rendered reviews
- `data/` — reviewed records, cohorts, and benchmark reports
- `benchmarks/` — retrieval, batching, and HTTP-load experiments
- `scripts/` — production startup and benchmark entry points
- `cloudflare/` — Worker and container routing
- `tests/` — service, request-contract, claim, family, queue, and frontend-client tests

## Contributing

Keep changes focused on a user-visible workflow, a measurable service behavior, or a reproducible data path. Run the targeted tests first, then the full suite and Ruff before opening a pull request. Do not include API keys, downloaded patent captures, model caches, or other local credentials in commits.

The original project is available at [kasigmon/NLP-Based-Patent-Specification-And-Claim-Analysis](https://github.com/kasigmon/NLP-Based-Patent-Specification-And-Claim-Analysis). This fork contains the local reconstruction and deployment work documented above.
