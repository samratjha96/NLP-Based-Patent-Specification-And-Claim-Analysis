# Natural Language Processing-Based Patent Specification and Claim Analysis
*Kirk A. Sigmon, kirk.a.sigmon.th@dartmouth.edu*

This is ***experimental*** code for various aspects of patent analysis.  There are currently two toolkits:
* **Support Analysis.**  Uses modern Natural Language Processing ("NLP") techniques to evaluate possible support (or lack thereof) in a patent specification.  This is at a sentence level and based on meaning; that is, you can ask a natural language query and get helpful examples of support even if those sentence(s)/paragraph(s) do not explicitly use terms in your query.  Patent specifications are retrieved directly from USPTO databases.  The support searching relies on a fusion of best-in-class **local-only** text embedding systems ([BAAI's BGE-M3](https://huggingface.co/BAAI/bge-m3) + [Okapi BM25](https://en.wikipedia.org/wiki/Okapi_BM25)) and a **local-only** re-ranker ([BAAI's BGE-Reranker-Large](https://huggingface.co/BAAI/bge-reranker-large)).  
* **Claim Analysis.**  Uses NLP techniques, such as [SpaCy](https://spacy.io/), to process patent claims for purposes such as structural analysis and error identification.  Arguably, this is just a more modernized, slightly more experimental version of [ClaimMaster](https://www.patentclaimmaster.com/).  One advantage of this work is that it could be used to programmatically and quickly evaluate large swaths of claims for major issues, particularly with enough computational firepower.  This includes:
  * **Antecedent Basis Analysis** - Identifies Noun Phrases (NP) that have been introduced but not used, used but not introduced, or properly introduced and used.  This tends to suggest antecedent basis issues under 35 U.S.C. § 112.
  * **Structural Analysis** - Uses [GraphViz](https://graphviz.org/) and SpaCy's transformers-based pipeline model ([en_core_web_trf](https://huggingface.co/spacy/en_core_web_trf)) to roughly graph different limitations of a claim.

***NONE OF THESE ARE FOR USE FOR REAL LEGAL WORK.***  This work is experimental only, and is not intended for "live" use.  It is not legal advice, and should not be construed as such.  It is largely programmed in my free time, and is full of limitations and errors. 

Future functionality(?):
* **Automatic identification of support weaknesses in claims.** Uses claim segments as queries and iteratively tests them against the specification to identify the weakest part of a claim.
* **Embedding-based Comparisons** - Use of embedding techniques to programmatically compare claims (both within and without a single patent).  Currently, I'm still slightly biased towards using [BGE](https://bge-model.com/).  This will likely be done in various dimensions:
  * Identifying unique steps within lengthy claims - that is, highlighting limitations or clauses that stick out (for better or worse).
  * Identifying family and/or portfolio-level standouts/trends.  For example, a quick diagnostic tool for major continuation-level shifts.

## Local setup

Create an isolated Python environment and install the runtime dependencies:

```bash
uv venv --python 3.12
uv pip install -r requirements.txt
```

For development and tests, install the development dependencies and run the
suite:

```bash
uv pip install -r requirements-dev.txt
uv run pytest
```

The claim analyzers use spaCy language pipelines. Install the transformer model
for production-equivalent behavior:

```bash
uv run python -m spacy download en_core_web_trf
```

For a smaller local smoke test, install `en_core_web_sm` and select it with an
environment variable:

```bash
uv run python -m spacy download en_core_web_sm
PATENTAGILITY_SPACY_MODEL=en_core_web_sm uv run python -c \
  "from core.antecedent_basis import analyze_intro_ref; print(analyze_intro_ref('A system comprising a processor and the memory coupled to the processor.'))"
```

Model caches default to `~/.cache/patentagility`. Override the root with
`PATENTAGILITY_CACHE_DIR` or set the Hugging Face and spaCy cache paths
individually with `PATENTAGILITY_HF_CACHE_DIR` and
`PATENTAGILITY_SPACY_CACHE_DIR`.

## Lawyer-facing web workspace

The inference service now serves a complete local frontend at `/`. It is built
as a patent-record-oriented review workspace rather than a collection of generic AI
forms: every result keeps the submitted question, source passage, confidence
context, and attorney-review boundary visible together.

Start the smaller throughput profile for a local product demo:

```bash
PATENTAGILITY_SPACY_MODEL=en_core_web_sm \
PATENTAGILITY_MODEL_PROFILE=throughput \
uv run python service.py
```

Then open `http://127.0.0.1:8000/`. Enter a U.S. patent or application number
on the overview. Without a key, the service retrieves structured public patent
text from Google Patents. This path supports a U.S. grant number or an
application number and does not run OCR. With `USPTO_API_KEY`, the service uses
the USPTO Open Data Portal and downloads the earliest file-wrapper
specification. Both paths make the specification and claims available to the
review tools. The browser stores the selected record and completed results in
IndexedDB. The live lookup response does not include the full specification or
claim text.

The retrieval layer keeps a small in-memory cache of public records so repeated
analyses do not download or extract the same public specification again. Raw
text submitted by a user is not eligible for this cache.

For a credential-free product walkthrough, choose **Open US 9,922,200** on the
overview. The app includes text from the official parent and continuation grant
documents. It also includes official document links, dated wrapper events,
three amendment snapshots, six independent claims, and a verified top-five
art-unit result from the authenticated deployed product. The support, coverage,
antecedent, linguistic, and family-comparison workflows process the saved
record through the local service. The examiner view uses a saved public
PatentAgility cohort for the examiner named on the patent.

The reconstruction covers the eight workflows shown by the deployed product.
It computes claim differences and concept coverage for the saved real family.
It reports dated amendment facts without inventing applicant intent. The saved
art-unit result demonstrates the deployed output contract; it is not a local
replacement for the author's trained 588-class routing model.

After a patent opens, the browser prepares the common claim and family checks
with no more than two requests at one time. It stores each prepared result in
IndexedDB. A tool opens the stored result before its refresh form. A page reload
does not repeat completed work. Semantic coverage work still goes through the
bounded inference queue.

| Workflow | Local status | Backing implementation |
|---|---|---|
| Specification support | Live | Bounded batched retrieval service |
| Antecedent basis | Live | `core/antecedent_basis.py` |
| Linguistic claim analysis | Live | Structured output from `core/claim_segmentation.py`; no system Graphviz binary required |
| Examiner analytics | Saved public cohort | Shows observed grant rates, office-action counts, statutory rejection rates, yearly outcomes, and peer comparisons for Samson B Lemma |
| U.S. family overview | Verified saved wrapper history | Maps both valid grants, four office actions, three amendment snapshots, and two notices of allowance |
| Compare U.S. family claims | Live | Aligns six independent claims in three pairs and identifies added, removed, and modified limitation blocks |
| Unclaimed subject matter | Live | Ranks disclosed concepts against all six independent family claims through the bounded semantic-analysis queue |
| Art Unit Predictor | Verified saved prediction | Shows five ranked candidates from 588 classes beside the observed art unit and official CPC codes |

The deployed PHP site submits normalized multipart form data to `POST /start/`.
The response contains a job ID, an event-stream URL, and a result URL. The
browser follows the event stream and opens the completed server-rendered result.
This reconstruction keeps the same task and progress model. Local development
serves the browser and analysis API from Flask. The Cloudflare deployment serves
the browser files at the edge and forwards only analysis API requests to the
same Flask service in the container.

## Cloudflare demo deployment

The Worker in `cloudflare/worker.js` is the public routing boundary. The
`web/` directory is deployed as Workers Static Assets, so loading the page,
JavaScript, CSS, `robots.txt`, or the favicon does not start the model
container. Unknown routes return `404` at the edge, and non-`POST` requests to
analysis routes return `405`.

Only these routes may start the container:

- `POST /v1/patents/lookup`
- `POST /v1/support/search`
- `POST /v1/claims/antecedent`
- `POST /v1/claims/diagram`
- `POST /v1/claims/diff`
- `POST /v1/family/claims/compare`
- `POST /v1/family/coverage`

The edge rate limiter is an abuse fuse, configured for eight admissions per
10 seconds. Cloudflare's counters are permissive and eventually consistent, so
the in-process 32-slot queue remains the exact admission boundary. Both layers
return `429` with `Retry-After`; the browser retries without requiring another
click. The single container sleeps after 15 minutes without an analysis
request.

Keep `ANALYSIS_ROUTES` in `cloudflare/worker.js`, the Flask routes in
`service.py`, and their callers in `web/app.js` synchronized. Public
`/health/*` and `/metrics` requests are intentionally rejected by the Worker;
the Docker health check reaches Flask over localhost.

Validate deployment configuration without publishing:

```bash
npx wrangler types
npx wrangler deploy --dry-run
```

Deploy with:

```bash
npx wrangler deploy
```

## Batched inference service

`service.py` keeps the local models resident in one process and places support
searches behind a bounded queue. The worker combines requests arriving within
a short window into one embedding/reranking batch and deduplicates repeated
patent texts and queries. Its bounded LRU index cache accepts only records that
the server loaded from the public USPTO source. Raw submitted text and search
queries are released after the request completes.

For local development:

```bash
PATENTAGILITY_MODEL_PROFILE=balanced uv run python service.py
```

For one server, start the tested Gunicorn configuration:

```bash
PATENTAGILITY_PORT=8000 scripts/start_production.sh
```

The production script defaults to one Gunicorn worker, 64 HTTP threads, one
`throughput` model replica, and the CPU device. Each Gunicorn worker owns one
model, one patent-index cache, and one bounded queue. A second worker does not
share these objects. Gunicorn rejects a multi-worker configuration unless
`PATENTAGILITY_ALLOW_MULTI_MODEL_WORKERS=1` is also set.

On `SIGTERM`, the worker stops queue admission, finishes accepted work, and
then exits. Gunicorn allows 180 seconds for this drain. The queue is
intentionally in-process and non-durable. Retryable overload returns `429`
with `Retry-After`, while work that misses its deadline returns `504`. The
browser follows `Retry-After` without a user action.

The 60-second cold-cache run used three public patent specifications and 16
clients on this machine. One CPU model worker completed 15,272 requests at
254.38 requests per second. Its median latency was 38.9 ms after a 21.2-second
cold first response. Peak process-tree RSS was 1.45 GB. Two model workers
completed 12,462 requests at 207.55 requests per second and peaked at 3.14 GB.
CPU contention made two workers 18.4% slower and about 2.12 times larger after
the run. One worker is the tested recommendation for this server.

The drain probe sent `SIGTERM` with 24 accepted requests still pending. All 24
completed, and Gunicorn exited with status 0 in 0.76 seconds. Reproduce the
load run with:

```bash
uv run python scripts/benchmark_production.py \
  --duration-seconds 60 --concurrency 16 --worker-counts 1 2
```

The measured report is in
[`data/benchmarks/production-server-benchmark.json`](data/benchmarks/production-server-benchmark.json).

Submit all claim limitations for one patent together so its specification is
embedded once:

```bash
curl http://127.0.0.1:8000/v1/support/search \
  -H 'Content-Type: application/json' \
  -d '{
    "patent_text": "The complete patent specification...",
    "queries": ["a processor coupled to memory", "a rechargeable power source"],
    "top_n": 10
  }'
```

Operational endpoints are `/health/live`, `/health/ready`, and `/metrics`.
Queue depth, rejection counts, timeouts, average batch size, queue wait time,
and index-cache hits are exposed as JSON.

### Model profiles

| Profile | Embedder | Reranker | Intended use |
|---|---|---|---|
| `balanced` | `Alibaba-NLP/gte-modernbert-base` | None | Default service profile; strongest PatentMatch result |
| `throughput` | `mixedbread-ai/mxbai-embed-xsmall-v1` | None | Maximum local throughput under heavy load |
| `baseline` | `BAAI/bge-m3` | `BAAI/bge-reranker-large` | Original repository behavior for comparison |

The PatentMatch measurements and reproduction commands are in
[`benchmarks/`](benchmarks/README.md). That benchmark is a prior-art retrieval
proxy, so production model selection should also use manually labeled examples
from the live claim-to-specification workflow.

### Capacity settings

| Environment variable | Default | Meaning |
|---|---:|---|
| `PATENTAGILITY_QUEUE_CAPACITY` | `32` | Maximum requests waiting for admission |
| `PATENTAGILITY_MAX_BATCH_SIZE` | `8` | Requests processed in one model batch |
| `PATENTAGILITY_MAX_BATCH_CHARACTERS` | `4000000` | Total input characters allowed in one batch |
| `PATENTAGILITY_BATCH_WINDOW_MS` | `20` | Maximum delay used to collect a batch |
| `PATENTAGILITY_REQUEST_TIMEOUT_SECONDS` | `120` | Caller deadline; pending work is cancelled |
| `PATENTAGILITY_INDEX_CACHE_SIZE` | `4` | Public USPTO patent indexes retained in memory; set to `0` to disable |
| `PATENTAGILITY_DEVICE` | Automatic | Model device; the production script defaults to `cpu` |
| `PATENTAGILITY_EMBEDDING_BATCH_SIZE` | `256` | SentenceTransformer device batch size |
| `PATENTAGILITY_RERANKER_BATCH_SIZE` | `32` | Cross-encoder device batch size |
| `PATENTAGILITY_MAX_PATENT_CHARACTERS` | `2000000` | Per-request patent-text limit |
| `PATENTAGILITY_MAX_QUERIES` | `64` | Query limit per request |
| `PATENTAGILITY_SHUTDOWN_TIMEOUT_SECONDS` | `180` | Maximum queue-drain time after shutdown starts |
| `PATENTAGILITY_WEB_WORKERS` | `1` | Gunicorn processes and model replicas |
| `PATENTAGILITY_WEB_THREADS` | `64` | HTTP threads in each Gunicorn worker |
| `USPTO_API_KEY` | None | Optional credential for USPTO file-wrapper lookup; public grant lookup works without it |
