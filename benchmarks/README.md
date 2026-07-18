# Patent retrieval benchmark

`benchmark_patentmatch.py` compares PatentAgility retrieval profiles using
real patent claim and examiner-cited prior-art paragraph pairs from
[PatentMatch](https://github.com/julian-risch/PatentMatch). The benchmark uses
the test split from the Apache-2.0-licensed
[`bhlim/patentmatch_for_finetuning`](https://huggingface.co/datasets/bhlim/patentmatch_for_finetuning)
dataset.

Download the small test split:

```bash
mkdir -p data/benchmark outputs
curl -fL \
  https://huggingface.co/datasets/bhlim/patentmatch_for_finetuning/resolve/main/data/test-00000-of-00001.parquet \
  -o data/benchmark/patentmatch-test.parquet
```

Run one deterministic profile:

```bash
uv run python benchmarks/benchmark_patentmatch.py \
  --dataset data/benchmark/patentmatch-test.parquet \
  --profile balanced \
  --sample-size 500 \
  --skip-reranker \
  --output outputs/patentmatch-balanced-500.json
```

Profiles currently cover the repository's BGE baseline, a Mixedbread
speed-oriented pair, a GTE ModernBERT pair, and GTE retrieval with a MiniLM
reranker. The fixed seed makes profile results directly comparable.

This is a prior-art retrieval proxy, not a complete evaluation of support
within a patent's own specification. Before changing production defaults,
also evaluate manually labeled claim-to-specification examples from the live
application.
