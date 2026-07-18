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
