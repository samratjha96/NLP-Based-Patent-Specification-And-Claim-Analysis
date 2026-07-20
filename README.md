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
export USPTO_API_KEY="your-open-data-portal-key"
PATENTAGILITY_SPACY_MODEL=en_core_web_sm \
PATENTAGILITY_MODEL_PROFILE=throughput \
uv run python service.py
```

Then open `http://127.0.0.1:8000/`. The web workspace does not retain
substantive claim or specification text in browser storage. Enter a U.S.
patent or application number on the overview to retrieve its public
file-wrapper record, download the earliest specification, extract its text,
and make the specification and claims available to the live review tools.

The USPTO Open Data Portal requires an account and API key. Without
`USPTO_API_KEY`, the workspace remains available but patent lookup returns a
clear configuration error rather than sample or fabricated record data. The
retrieval layer keeps a small in-memory record cache so repeated analyses of
one patent record do not download or extract the same specification again.

For a credential-free product walkthrough, choose **Try example patent** on the
overview. The built-in `Example DS-101` dossier is clearly labeled as synthetic,
does not contact the USPTO, and carries one internally consistent specification,
claim set, family history, coverage review, routing estimate, and analytics
cohort through all eight workflows.

The reconstruction covers the eight workflows shown by the deployed product.
The public repository can execute three of them end to end; five require the
author's private data or models and are deliberately labeled as prototype
views rather than presented as live analysis:

| Workflow | Local status | Backing implementation |
|---|---|---|
| Specification support | Live | Bounded batched retrieval service |
| Antecedent basis | Live | `core/antecedent_basis.py` |
| Linguistic claim analysis | Live | Structured output from `core/claim_segmentation.py`; no system Graphviz binary required |
| Examiner analytics | Prototype view | Private USPTO analytics database required |
| Claim amendment history | Prototype view | Private family and prosecution data required |
| Compare U.S. family claims | Prototype view | Private family and grant corpus required |
| Unclaimed subject matter | Prototype view | Private specification/family corpus required |
| Art unit predictor | Prototype view | Private patent-BERT classifier required |

The deployed PHP site submits normalized form data to `POST /start/`, polls
`GET /results/<job-id>/` as JSON, and then opens the completed server-rendered
result. This local reconstruction keeps the same task and progress model but
calls the same-origin Flask analysis endpoints directly because Flask owns both
the browser application and bounded inference lifecycle.

## Batched inference service

`service.py` keeps the local models resident in one process and places support
searches behind a bounded queue. The worker combines requests arriving within
a short window into one embedding/reranking batch, deduplicates repeated patent
texts and queries, and keeps a bounded LRU cache of recently built patent
indexes.

For local development:

```bash
PATENTAGILITY_MODEL_PROFILE=balanced uv run python service.py
```

For a Linux deployment, use one Gunicorn process so model weights are not
duplicated, and enough HTTP threads to let overload requests receive an
immediate response:

```bash
PATENTAGILITY_MODEL_PROFILE=balanced \
  uv run gunicorn --workers 1 --threads 64 --timeout 150 \
  'service:create_app()'
```

Scale with additional service instances only when the host has enough memory
for another complete model copy. The queue is intentionally in-process and
non-durable: retryable overload returns `429` with `Retry-After`, while work
that misses its deadline returns `504`. The included browser client follows
`Retry-After`, adds a small random delay to avoid synchronized retries, and
keeps trying for up to two minutes before asking the user to resubmit.

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
| `PATENTAGILITY_INDEX_CACHE_SIZE` | `4` | Recently embedded patent specifications retained |
| `PATENTAGILITY_EMBEDDING_BATCH_SIZE` | `256` | SentenceTransformer device batch size |
| `PATENTAGILITY_RERANKER_BATCH_SIZE` | `32` | Cross-encoder device batch size |
| `PATENTAGILITY_MAX_PATENT_CHARACTERS` | `2000000` | Per-request patent-text limit |
| `PATENTAGILITY_MAX_QUERIES` | `64` | Query limit per request |
| `USPTO_API_KEY` | None | Required credential for official patent and application lookup |
