"""Measure sequential versus queued micro-batched support inference."""

from __future__ import annotations

import argparse
import json
import random
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import duckdb

from core.batch_queue import BatchProcessor
from core.support_runtime import MODEL_PROFILES, SupportAnalyzer, SupportRequest


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--profile", choices=MODEL_PROFILES, default="balanced")
    parser.add_argument("--requests", type=int, default=8)
    parser.add_argument("--paragraphs", type=int, default=50)
    parser.add_argument("--output", type=Path)
    return parser.parse_args()


def load_requests(path: Path, request_count: int, paragraph_count: int):
    rows = (
        duckdb.connect()
        .execute(
            "SELECT anchor, positive FROM read_parquet(?) "
            "WHERE anchor IS NOT NULL AND positive IS NOT NULL",
            [str(path)],
        )
        .fetchall()
    )
    sample = random.Random(20260718).sample(rows, max(request_count, paragraph_count))
    patent_text = "\n\n".join(
        positive for _anchor, positive in sample[:paragraph_count]
    )
    return [
        SupportRequest(
            patent_text=patent_text,
            queries=(anchor,),
            top_n=5,
            request_id=f"load-{index}",
        )
        for index, (anchor, _positive) in enumerate(sample[:request_count])
    ]


def main() -> None:
    args = parse_args()
    requests = load_requests(args.dataset, args.requests, args.paragraphs)
    analyzer = SupportAnalyzer(
        profile=MODEL_PROFILES[args.profile],
        index_cache_size=0,
    )

    analyzer.analyze_batch([requests[0]])

    started = time.perf_counter()
    sequential_results = [analyzer.analyze_batch([item])[0] for item in requests]
    sequential_seconds = time.perf_counter() - started

    processor = BatchProcessor(
        analyzer.analyze_batch,
        capacity=len(requests),
        max_batch_size=len(requests),
        batch_window_seconds=0.1,
    )
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=len(requests)) as executor:
        futures = [
            executor.submit(processor.submit, item, timeout=600) for item in requests
        ]
        batched_results = [future.result() for future in futures]
    batched_seconds = time.perf_counter() - started
    metrics = processor.snapshot()
    processor.close()

    result = {
        "profile": args.profile,
        "requests": len(requests),
        "paragraphs": args.paragraphs,
        "sequential_seconds": sequential_seconds,
        "queued_batched_seconds": batched_seconds,
        "throughput_speedup": sequential_seconds / batched_seconds,
        "average_batch_size": metrics["average_batch_size"],
        "same_results": batched_results == sequential_results,
        "queue_metrics": metrics,
    }
    rendered = json.dumps(result, indent=2) + "\n"
    print(rendered, end="")
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered)


if __name__ == "__main__":
    main()
