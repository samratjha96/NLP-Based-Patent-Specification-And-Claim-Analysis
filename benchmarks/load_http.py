"""Send a concurrent burst to verify HTTP backpressure behavior."""

from __future__ import annotations

import argparse
import json
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

import requests


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8000")
    parser.add_argument("--requests", type=int, default=16)
    parser.add_argument("--concurrency", type=int, default=16)
    parser.add_argument("--sentences", type=int, default=1_000)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if min(args.requests, args.concurrency, args.sentences) < 1:
        raise ValueError("requests, concurrency, and sentences must be positive")
    barrier = threading.Barrier(min(args.concurrency, args.requests))
    patent_text = " ".join(
        f"A processor {index} is coupled to a memory {index}."
        for index in range(args.sentences)
    )

    def send(index: int) -> tuple[int, float, str | None]:
        barrier.wait()
        started = time.perf_counter()
        response = requests.post(
            f"{args.url}/v1/support/search",
            json={
                "patent_text": patent_text,
                "query": f"processor {index} memory",
                "top_n": 5,
            },
            headers={"X-Request-ID": f"load-{index}"},
            timeout=180,
        )
        return (
            response.status_code,
            time.perf_counter() - started,
            response.headers.get("Retry-After"),
        )

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        results = list(executor.map(send, range(args.requests)))
    duration = time.perf_counter() - started

    statuses = Counter(status for status, _elapsed, _retry in results)
    print(
        json.dumps(
            {
                "requests": args.requests,
                "concurrency": args.concurrency,
                "duration_seconds": duration,
                "status_counts": dict(statuses),
                "retry_after_values": sorted(
                    {retry for _status, _elapsed, retry in results if retry}
                ),
                "max_request_seconds": max(
                    elapsed for _status, elapsed, _retry in results
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
