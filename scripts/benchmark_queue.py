#!/usr/bin/env python3
"""Measure queue admission, batching, latency, and retry recovery."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import math
import random
import statistics
import threading
import time
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


DEFAULT_QUERIES = (
    "an area in memory that protects code and data from outside the area",
    "a public key that corresponds to a processor identifier",
    "store encrypted content on an identified processor",
    "decrypt encrypted content inside a secure enclave",
)


@dataclass(frozen=True)
class RequestResult:
    status: int
    latency_seconds: float
    attempts: int
    retry_after_seconds: float | None
    error: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8766")
    parser.add_argument(
        "--demo-record",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "demo_record.js",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "data"
        / "benchmarks"
        / "queue-load-benchmark.json",
    )
    parser.add_argument("--normal-requests", type=int, default=24)
    parser.add_argument("--sequential-requests", type=int, default=12)
    parser.add_argument("--overload-requests", type=int, default=96)
    parser.add_argument("--retry-requests", type=int, default=64)
    parser.add_argument("--request-timeout", type=float, default=180.0)
    return parser.parse_args()


def load_demo_record(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8").strip()
    prefix = "window.PatentAgilityDemoRecord = "
    if not text.startswith(prefix) or not text.endswith(";"):
        raise ValueError(f"unsupported demo record format: {path}")
    return json.loads(text[len(prefix) : -1])


def get_json(url: str, timeout: float) -> dict[str, Any]:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.load(response)


def post_support_search(
    *,
    url: str,
    payload: dict[str, Any],
    request_timeout: float,
    max_attempts: int,
    request_number: int,
) -> RequestResult:
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    started = time.perf_counter()
    last_retry_after: float | None = None
    rng = random.Random(request_number)

    for attempt in range(1, max_attempts + 1):
        request = urllib.request.Request(
            url,
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Request-ID": f"queue-benchmark-{request_number}-{attempt}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=request_timeout) as response:
                response.read()
                return RequestResult(
                    status=response.status,
                    latency_seconds=time.perf_counter() - started,
                    attempts=attempt,
                    retry_after_seconds=last_retry_after,
                    error=None,
                )
        except urllib.error.HTTPError as exc:
            response_body = exc.read().decode("utf-8", errors="replace")
            if exc.code != 429 or attempt == max_attempts:
                return RequestResult(
                    status=exc.code,
                    latency_seconds=time.perf_counter() - started,
                    attempts=attempt,
                    retry_after_seconds=last_retry_after,
                    error=response_body,
                )
            raw_retry_after = exc.headers.get("Retry-After", "1")
            try:
                last_retry_after = max(0.0, float(raw_retry_after))
            except ValueError:
                last_retry_after = 1.0
            time.sleep(last_retry_after + rng.uniform(0.0, 0.25))
        except (TimeoutError, urllib.error.URLError) as exc:
            return RequestResult(
                status=0,
                latency_seconds=time.perf_counter() - started,
                attempts=attempt,
                retry_after_seconds=last_retry_after,
                error=str(exc),
            )

    raise AssertionError("request loop ended without a result")


def percentile(values: list[float], percentile_value: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, math.ceil(percentile_value * len(ordered)) - 1)
    return ordered[index]


def metric_delta(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    keys = (
        "accepted",
        "rejected",
        "completed",
        "failed",
        "timed_out",
        "cancelled",
        "batches",
        "batch_items",
        "batch_cost",
        "processing_seconds",
        "queue_wait_seconds",
        "index_cache_hits",
        "index_cache_misses",
    )
    delta = {
        key: after.get(key, 0) - before.get(key, 0)
        for key in keys
        if key in before or key in after
    }
    batch_count = delta.get("batches", 0)
    batch_items = delta.get("batch_items", 0)
    delta["average_batch_size"] = batch_items / batch_count if batch_count else 0.0
    delta["average_queue_wait_seconds"] = (
        delta.get("queue_wait_seconds", 0.0) / batch_items if batch_items else 0.0
    )
    return delta


def run_phase(
    *,
    name: str,
    base_url: str,
    patent_text: str,
    request_count: int,
    concurrency: int,
    max_attempts: int,
    request_timeout: float,
) -> dict[str, Any]:
    metrics_url = f"{base_url}/metrics"
    endpoint = f"{base_url}/v1/support/search"
    before = get_json(metrics_url, request_timeout)
    stop_polling = threading.Event()
    samples: list[dict[str, Any]] = []

    def poll_metrics() -> None:
        while not stop_polling.wait(0.01):
            try:
                samples.append(get_json(metrics_url, 2.0))
            except (TimeoutError, urllib.error.URLError):
                continue

    poller = threading.Thread(target=poll_metrics, daemon=True)
    poller.start()
    start_gate = threading.Event()

    def run_one(index: int) -> RequestResult:
        start_gate.wait()
        payload = {
            "patent_text": patent_text,
            "query": DEFAULT_QUERIES[index % len(DEFAULT_QUERIES)],
            "top_n": 8,
        }
        return post_support_search(
            url=endpoint,
            payload=payload,
            request_timeout=request_timeout,
            max_attempts=max_attempts,
            request_number=index,
        )

    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(run_one, index) for index in range(request_count)]
        start_gate.set()
        results = [future.result() for future in futures]
    wall_seconds = time.perf_counter() - started
    stop_polling.set()
    poller.join(timeout=2.0)
    after = get_json(metrics_url, request_timeout)

    latencies = [result.latency_seconds for result in results]
    status_counts: dict[str, int] = {}
    for result in results:
        key = str(result.status)
        status_counts[key] = status_counts.get(key, 0) + 1
    successes = status_counts.get("200", 0)
    retry_attempts = sum(result.attempts - 1 for result in results)

    return {
        "name": name,
        "offered_requests": request_count,
        "concurrency": concurrency,
        "max_attempts": max_attempts,
        "wall_seconds": wall_seconds,
        "successful_requests_per_second": successes / wall_seconds,
        "status_counts": status_counts,
        "retry_attempts": retry_attempts,
        "latency_seconds": {
            "minimum": min(latencies),
            "median": statistics.median(latencies),
            "p95": percentile(latencies, 0.95),
            "p99": percentile(latencies, 0.99),
            "maximum": max(latencies),
        },
        "peak_observed": {
            "queue_depth": max(
                [
                    before.get("queue_depth", 0),
                    *[s.get("queue_depth", 0) for s in samples],
                ]
            ),
            "inflight": max(
                [before.get("inflight", 0), *[s.get("inflight", 0) for s in samples]]
            ),
        },
        "metrics_delta": metric_delta(before, after),
        "results": [asdict(result) for result in results],
    }


def main() -> None:
    args = parse_args()
    record = load_demo_record(args.demo_record)
    patent_text = record["specification_text"]
    ready = get_json(f"{args.base_url}/health/ready", args.request_timeout)
    if not ready.get("ready"):
        raise RuntimeError(f"service is not ready: {ready}")

    post_support_search(
        url=f"{args.base_url}/v1/support/search",
        payload={
            "patent_text": patent_text,
            "query": DEFAULT_QUERIES[0],
            "top_n": 8,
        },
        request_timeout=args.request_timeout,
        max_attempts=1,
        request_number=-1,
    )

    phases = []
    phases.append(
        run_phase(
            name="sequential_baseline",
            base_url=args.base_url,
            patent_text=patent_text,
            request_count=args.sequential_requests,
            concurrency=1,
            max_attempts=1,
            request_timeout=args.request_timeout,
        )
    )
    phases.append(
        run_phase(
            name="normal_burst",
            base_url=args.base_url,
            patent_text=patent_text,
            request_count=args.normal_requests,
            concurrency=args.normal_requests,
            max_attempts=1,
            request_timeout=args.request_timeout,
        )
    )
    phases.append(
        run_phase(
            name="overload_without_retry",
            base_url=args.base_url,
            patent_text=patent_text,
            request_count=args.overload_requests,
            concurrency=args.overload_requests,
            max_attempts=1,
            request_timeout=args.request_timeout,
        )
    )
    phases.append(
        run_phase(
            name="overload_with_retry",
            base_url=args.base_url,
            patent_text=patent_text,
            request_count=args.retry_requests,
            concurrency=args.retry_requests,
            max_attempts=6,
            request_timeout=args.request_timeout,
        )
    )

    final_metrics = get_json(f"{args.base_url}/metrics", args.request_timeout)
    sequential_phase = phases[0]
    normal_phase = phases[1]
    overload_phase = phases[2]
    retry_phase = phases[3]
    report = {
        "created_at": datetime.now(UTC).isoformat(),
        "service_url": args.base_url,
        "record": {
            "record_id": record.get("record_id"),
            "display_identifier": record.get("display_identifier"),
            "title": record.get("title"),
            "specification_characters": len(patent_text),
        },
        "service_configuration_observed": {
            "model_profile": final_metrics.get("model_profile"),
            "queue_capacity": final_metrics.get("queue_capacity"),
        },
        "phases": phases,
        "summary": {
            "batched_to_sequential_throughput_ratio": (
                normal_phase["successful_requests_per_second"]
                / sequential_phase["successful_requests_per_second"]
            ),
            "normal_burst_average_batch_size": normal_phase["metrics_delta"][
                "average_batch_size"
            ],
            "overload_rejections": overload_phase["status_counts"].get("429", 0),
            "overload_peak_queue_depth": overload_phase["peak_observed"]["queue_depth"],
            "retry_run_successes": retry_phase["status_counts"].get("200", 0),
            "retry_run_extra_attempts": retry_phase["retry_attempts"],
            "retry_after_seconds_observed": sorted(
                {
                    result["retry_after_seconds"]
                    for result in retry_phase["results"]
                    if result["retry_after_seconds"] is not None
                }
            ),
        },
        "final_metrics": final_metrics,
        "limits": [
            "This is a single-process benchmark on one local machine.",
            "The sequential baseline is this service with one client. It is not a measurement of the deployed PatentAgility service.",
            "The benchmark uses a warm, repeated patent record to measure request batching and queue control.",
            "The metrics endpoint is sampled every 10 ms, so brief peaks can occur between samples.",
            "HTTP 429 results prove bounded admission. They do not increase compute capacity.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "output": str(args.output),
                "record": report["record"],
                "summary": report["summary"],
                "phases": [
                    {
                        "name": phase["name"],
                        "wall_seconds": phase["wall_seconds"],
                        "successful_requests_per_second": phase[
                            "successful_requests_per_second"
                        ],
                        "status_counts": phase["status_counts"],
                        "retry_attempts": phase["retry_attempts"],
                        "average_batch_size": phase["metrics_delta"][
                            "average_batch_size"
                        ],
                    }
                    for phase in phases
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
