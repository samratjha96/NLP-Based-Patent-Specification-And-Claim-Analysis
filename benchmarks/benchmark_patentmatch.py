"""Benchmark PatentAgility retrieval profiles on examiner-linked patent text.

The PatentMatch test data contains real patent claim and cited prior-art
paragraph pairs. Each sampled positive paragraph becomes one document in the
retrieval corpus; the other sampled positives serve as deterministic negatives.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import re
import resource
import time
from dataclasses import dataclass
from pathlib import Path

import duckdb
import numpy as np
import torch
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder, SentenceTransformer


TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


@dataclass(frozen=True)
class Profile:
    embedder: str
    reranker: str


PROFILES = {
    "baseline": Profile("BAAI/bge-m3", "BAAI/bge-reranker-large"),
    "speed": Profile(
        "mixedbread-ai/mxbai-embed-xsmall-v1",
        "mixedbread-ai/mxbai-rerank-xsmall-v1",
    ),
    "balanced": Profile(
        "Alibaba-NLP/gte-modernbert-base",
        "Alibaba-NLP/gte-reranker-modernbert-base",
    ),
    "gte_minilm": Profile(
        "Alibaba-NLP/gte-modernbert-base",
        "cross-encoder/ms-marco-MiniLM-L6-v2",
    ),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--profile", choices=PROFILES, required=True)
    parser.add_argument("--sample-size", type=int, default=100)
    parser.add_argument("--seed", type=int, default=20260718)
    parser.add_argument("--candidate-k", type=int, default=20)
    parser.add_argument(
        "--candidate-source", choices=("dense", "fusion"), default="fusion"
    )
    parser.add_argument("--skip-reranker", action="store_true")
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args()


def load_pairs(path: Path, sample_size: int, seed: int) -> tuple[list[str], list[str]]:
    rows = (
        duckdb.connect()
        .execute(
            "SELECT anchor, positive FROM read_parquet(?) "
            "WHERE anchor IS NOT NULL AND positive IS NOT NULL",
            [str(path)],
        )
        .fetchall()
    )
    rows = [(anchor.strip(), positive.strip()) for anchor, positive in rows]
    rows = [(anchor, positive) for anchor, positive in rows if anchor and positive]
    if sample_size > len(rows):
        raise ValueError(f"requested {sample_size} pairs from only {len(rows)} rows")
    return tuple(map(list, zip(*random.Random(seed).sample(rows, sample_size))))


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(text.lower())


def top_indices(scores: np.ndarray, k: int) -> list[int]:
    k = min(k, len(scores))
    return np.argsort(-scores, kind="stable")[:k].tolist()


def reciprocal_rank(ranking: list[int], relevant: int) -> float:
    try:
        return 1.0 / (ranking.index(relevant) + 1)
    except ValueError:
        return 0.0


def summarize_rankings(rankings: list[list[int]]) -> dict[str, float]:
    reciprocal_ranks = [
        reciprocal_rank(ranking, i) for i, ranking in enumerate(rankings)
    ]
    return {
        "mrr": float(np.mean(reciprocal_ranks)),
        "recall_at_1": float(np.mean([rr == 1.0 for rr in reciprocal_ranks])),
        "recall_at_5": float(np.mean([rr >= 0.2 for rr in reciprocal_ranks])),
        "recall_at_10": float(np.mean([rr >= 0.1 for rr in reciprocal_ranks])),
        "recall_at_20": float(np.mean([rr >= 0.05 for rr in reciprocal_ranks])),
    }


def rrf_rank(bm25_scores: np.ndarray, dense_scores: np.ndarray) -> list[int]:
    bm25_rank = top_indices(bm25_scores, len(bm25_scores))
    dense_rank = top_indices(dense_scores, len(dense_scores))
    bm25_positions = {doc_id: rank for rank, doc_id in enumerate(bm25_rank, start=1)}
    dense_positions = {doc_id: rank for rank, doc_id in enumerate(dense_rank, start=1)}
    fused = {
        doc_id: 1.0 / (60 + bm25_positions[doc_id])
        + 1.0 / (60 + dense_positions[doc_id])
        for doc_id in range(len(bm25_scores))
    }
    return sorted(fused, key=fused.get, reverse=True)


def device_name() -> str:
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> None:
    args = parse_args()
    profile = PROFILES[args.profile]
    queries, corpus = load_pairs(args.dataset, args.sample_size, args.seed)
    device = device_name()

    started = time.perf_counter()
    embedder = SentenceTransformer(profile.embedder, device=device)
    embedder_load_seconds = time.perf_counter() - started

    started = time.perf_counter()
    corpus_embeddings = embedder.encode(
        corpus,
        batch_size=32,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    corpus_embed_seconds = time.perf_counter() - started

    started = time.perf_counter()
    query_embeddings = embedder.encode(
        queries,
        batch_size=32,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    query_embed_seconds = time.perf_counter() - started

    dense_rankings: list[list[int]] = []
    fused_rankings: list[list[int]] = []
    bm25 = BM25Okapi([tokenize(text) for text in corpus])
    for query_embedding, query in zip(query_embeddings, queries):
        dense_scores = corpus_embeddings @ query_embedding
        bm25_scores = np.asarray(bm25.get_scores(tokenize(query)), dtype=np.float32)
        dense_rankings.append(top_indices(dense_scores, len(corpus)))
        fused_rankings.append(rrf_rank(bm25_scores, dense_scores))

    reranked: list[list[int]] = []
    reranker_load_seconds = 0.0
    rerank_seconds = 0.0
    if not args.skip_reranker:
        started = time.perf_counter()
        reranker = CrossEncoder(profile.reranker, device=device)
        reranker_load_seconds = time.perf_counter() - started

        rerank_started = time.perf_counter()
        candidate_rankings = (
            dense_rankings if args.candidate_source == "dense" else fused_rankings
        )
        for query, candidates in zip(queries, candidate_rankings):
            candidate_ids = candidates[: args.candidate_k]
            pairs = [(query, corpus[doc_id]) for doc_id in candidate_ids]
            scores = np.asarray(
                reranker.predict(pairs, batch_size=16), dtype=np.float32
            )
            order = np.argsort(-scores, kind="stable")
            reranked.append([candidate_ids[index] for index in order])
        rerank_seconds = time.perf_counter() - rerank_started

    result = {
        "profile": args.profile,
        "embedder": profile.embedder,
        "reranker": profile.reranker,
        "device": device,
        "sample_size": args.sample_size,
        "seed": args.seed,
        "candidate_k": args.candidate_k,
        "candidate_source": args.candidate_source,
        "quality": {
            "dense": summarize_rankings(dense_rankings),
            "bm25_dense_rrf": summarize_rankings(fused_rankings),
            "reranked": summarize_rankings(reranked) if reranked else None,
        },
        "timing_seconds": {
            "embedder_load": embedder_load_seconds,
            "corpus_embedding": corpus_embed_seconds,
            "query_embedding": query_embed_seconds,
            "reranker_load": reranker_load_seconds,
            "reranking": rerank_seconds,
            "reranking_per_query": rerank_seconds / args.sample_size,
        },
        "process_peak_rss_mb": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        / (1024 * 1024),
        "environment": {
            "torch": torch.__version__,
            "python_hash_seed": os.environ.get("PYTHONHASHSEED"),
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
