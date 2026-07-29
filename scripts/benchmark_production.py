#!/usr/bin/env python3
"""Measure cold mixed-patent load, process memory, and queue draining."""

from __future__ import annotations

import argparse
import concurrent.futures
import html
import json
import math
import os
import random
import re
import signal
import statistics
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


PATENT_SOURCES = (
    ("US 10,831,913 B2", "https://patents.google.com/patent/US10831913B2/en"),
    ("US 10,000,000 B2", "https://patents.google.com/patent/US10000000B2/en"),
)
QUERIES = (
    "a processor-specific public key associated with a hardware processor",
    "protected execution memory that isolates code and data",
    "a detector that measures distance from reflected light",
    "secure storage on a selected computing device",
)


@dataclass(frozen=True)
class PatentDocument:
    identifier: str
    source_url: str
    text: str


@dataclass(frozen=True)
class RequestResult:
    patent_identifier: str
    status: int
    latency_seconds: float
    attempts: int
    error: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--duration-seconds", type=float, default=60.0)
    parser.add_argument("--concurrency", type=int, default=16)
    parser.add_argument("--worker-counts", type=int, nargs="+", default=[1, 2])
    parser.add_argument("--web-threads", type=int, default=64)
    parser.add_argument("--model-profile", default="throughput")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--base-port", type=int, default=8780)
    parser.add_argument("--request-timeout", type=float, default=180.0)
    parser.add_argument(
        "--demo-record",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "web" / "demo_record.js",
    )
    parser.add_argument(
        "--patent-html-dir",
        type=Path,
        help="read US10831913B2.html and US10000000B2.html from this directory",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1]
        / "data"
        / "benchmarks"
        / "production-server-benchmark.json",
    )
    return parser.parse_args()


def load_demo_record(path: Path) -> PatentDocument:
    source = path.read_text(encoding="utf-8").strip()
    prefix = "window.PatentAgilityDemoRecord = "
    if not source.startswith(prefix) or not source.endswith(";"):
        raise ValueError(f"unsupported demo record format: {path}")
    record = json.loads(source[len(prefix) : -1])
    return PatentDocument(
        identifier=record["display_identifier"],
        source_url=record["source_documents"][1]["url"],
        text=record["specification_text"],
    )


def fetch_patent(
    identifier: str, url: str, html_directory: Path | None
) -> PatentDocument:
    patent_id = url.split("/patent/", 1)[1].split("/", 1)[0]
    if html_directory is None:
        request = urllib.request.Request(
            url, headers={"User-Agent": "PatentAgility/1.0"}
        )
        with urllib.request.urlopen(request, timeout=45) as response:
            page = response.read().decode("utf-8", errors="replace")
    else:
        page = (html_directory / f"{patent_id}.html").read_text(
            encoding="utf-8", errors="replace"
        )
    match = re.search(
        r'<section[^>]+itemprop="description"[^>]*>(.*?)</section>',
        page,
        flags=re.DOTALL,
    )
    if match is None:
        raise ValueError(f"description not found for {identifier}")
    text = re.sub(r"<[^>]+>", " ", match.group(1))
    text = re.sub(r"\s+", " ", html.unescape(text)).strip()
    if len(text) < 5_000:
        raise ValueError(f"description was too short for {identifier}")
    return PatentDocument(identifier=identifier, source_url=url, text=text)


def load_corpus(
    demo_record: Path, html_directory: Path | None = None
) -> list[PatentDocument]:
    return [
        load_demo_record(demo_record),
        *(
            fetch_patent(identifier, url, html_directory)
            for identifier, url in PATENT_SOURCES
        ),
    ]


def get_json(url: str, timeout: float = 5.0) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Connection": "close"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def post_search(
    base_url: str,
    document: PatentDocument,
    query: str,
    request_timeout: float,
    request_number: int,
    max_attempts: int = 4,
) -> RequestResult:
    payload = json.dumps(
        {"patent_text": document.text, "query": query, "top_n": 8},
        separators=(",", ":"),
    ).encode("utf-8")
    started = time.perf_counter()
    rng = random.Random(request_number)
    for attempt in range(1, max_attempts + 1):
        request = urllib.request.Request(
            f"{base_url}/v1/support/search",
            data=payload,
            method="POST",
            headers={
                "Connection": "close",
                "Content-Type": "application/json",
                "X-Request-ID": f"production-benchmark-{request_number}-{attempt}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=request_timeout) as response:
                response.read()
                return RequestResult(
                    document.identifier,
                    response.status,
                    time.perf_counter() - started,
                    attempt,
                    None,
                )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            if exc.code != 429 or attempt == max_attempts:
                return RequestResult(
                    document.identifier,
                    exc.code,
                    time.perf_counter() - started,
                    attempt,
                    body,
                )
            retry_after = float(exc.headers.get("Retry-After", "1"))
            time.sleep(max(0.0, retry_after) + rng.uniform(0.0, 0.2))
        except (TimeoutError, ConnectionError, urllib.error.URLError) as exc:
            return RequestResult(
                document.identifier,
                0,
                time.perf_counter() - started,
                attempt,
                str(exc),
            )
    raise AssertionError("request loop ended without a result")


def percentile(values: list[float], value: float) -> float:
    ordered = sorted(values)
    index = max(0, math.ceil(value * len(ordered)) - 1)
    return ordered[index]


def process_tree_rss(master_pid: int) -> dict[str, Any]:
    output = subprocess.check_output(
        ["ps", "-axo", "pid=,ppid=,rss="],
        text=True,
    )
    processes: dict[int, tuple[int, int]] = {}
    for line in output.splitlines():
        fields = line.split()
        if len(fields) != 3:
            continue
        pid, parent_pid, rss_kib = map(int, fields)
        processes[pid] = (parent_pid, rss_kib)

    selected = {master_pid}
    changed = True
    while changed:
        changed = False
        for pid, (parent_pid, _rss_kib) in processes.items():
            if parent_pid in selected and pid not in selected:
                selected.add(pid)
                changed = True

    rss_by_pid = {
        str(pid): processes[pid][1] * 1_024
        for pid in sorted(selected)
        if pid in processes
    }
    return {
        "process_ids": [int(pid) for pid in rss_by_pid],
        "rss_bytes_by_process": rss_by_pid,
        "total_rss_bytes": sum(rss_by_pid.values()),
    }


def wait_for_workers(
    base_url: str,
    worker_count: int,
    process: subprocess.Popen[bytes],
    timeout: float,
) -> tuple[float, list[int]]:
    started = time.perf_counter()
    process_ids: set[int] = set()
    deadline = started + timeout
    while time.perf_counter() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Gunicorn exited with status {process.returncode}")
        try:
            metrics = get_json(f"{base_url}/metrics", timeout=2.0)
            process_ids.add(int(metrics["process_id"]))
            if len(process_ids) >= worker_count:
                return time.perf_counter() - started, sorted(process_ids)
        except (KeyError, ValueError, OSError, urllib.error.URLError):
            pass
        time.sleep(0.05)
    raise TimeoutError(f"only observed {len(process_ids)} of {worker_count} workers")


def start_server(
    root: Path,
    worker_count: int,
    port: int,
    model_profile: str,
    device: str,
    web_threads: int,
) -> tuple[subprocess.Popen[bytes], Any]:
    gunicorn = Path(sys.executable).with_name("gunicorn")
    if not gunicorn.exists():
        raise FileNotFoundError(f"Gunicorn is not installed at {gunicorn}")
    log = tempfile.TemporaryFile()
    environment = os.environ.copy()
    environment.update(
        {
            "PATENTAGILITY_HOST": "127.0.0.1",
            "PATENTAGILITY_PORT": str(port),
            "PATENTAGILITY_WEB_WORKERS": str(worker_count),
            "PATENTAGILITY_WEB_THREADS": str(web_threads),
            "PATENTAGILITY_ALLOW_MULTI_MODEL_WORKERS": "1",
            "PATENTAGILITY_MODEL_PROFILE": model_profile,
            "PATENTAGILITY_DEVICE": device,
        }
    )
    process = subprocess.Popen(
        [str(gunicorn), "-c", "gunicorn.conf.py"],
        cwd=root,
        env=environment,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    return process, log


def run_load(
    base_url: str,
    documents: list[PatentDocument],
    duration_seconds: float,
    concurrency: int,
    request_timeout: float,
    master_pid: int,
) -> dict[str, Any]:
    deadline = time.monotonic() + duration_seconds
    counter = 0
    counter_lock = threading.Lock()
    result_lock = threading.Lock()
    results: list[RequestResult] = []
    first_success: dict[str, float] = {}
    memory_samples: list[int] = []
    stop_memory = threading.Event()

    def sample_memory() -> None:
        while not stop_memory.wait(0.25):
            try:
                memory_samples.append(process_tree_rss(master_pid)["total_rss_bytes"])
            except (OSError, subprocess.SubprocessError):
                continue

    def next_request_number() -> int:
        nonlocal counter
        with counter_lock:
            value = counter
            counter += 1
            return value

    def worker() -> None:
        while time.monotonic() < deadline:
            request_number = next_request_number()
            document = documents[request_number % len(documents)]
            result = post_search(
                base_url,
                document,
                QUERIES[request_number % len(QUERIES)],
                request_timeout,
                request_number,
            )
            with result_lock:
                results.append(result)
                if result.status == 200 and document.identifier not in first_success:
                    first_success[document.identifier] = result.latency_seconds

    sampler = threading.Thread(target=sample_memory, daemon=True)
    sampler.start()
    started = time.perf_counter()
    with concurrent.futures.ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = [executor.submit(worker) for _index in range(concurrency)]
        for future in futures:
            future.result()
    wall_seconds = time.perf_counter() - started
    stop_memory.set()
    sampler.join(timeout=2.0)

    latencies = [result.latency_seconds for result in results]
    statuses = Counter(str(result.status) for result in results)
    successes = statuses.get("200", 0)
    return {
        "requested_duration_seconds": duration_seconds,
        "wall_seconds": wall_seconds,
        "concurrency": concurrency,
        "logical_requests": len(results),
        "attempts": sum(result.attempts for result in results),
        "retries": sum(result.attempts - 1 for result in results),
        "status_counts": dict(sorted(statuses.items())),
        "successful_requests_per_second": successes / wall_seconds,
        "latency_seconds": {
            "median": statistics.median(latencies),
            "p95": percentile(latencies, 0.95),
            "p99": percentile(latencies, 0.99),
            "maximum": max(latencies),
        },
        "cold_first_success_seconds_by_patent": first_success,
        "peak_process_tree_rss_bytes": max(memory_samples, default=0),
    }


def run_drain_probe(
    process: subprocess.Popen[bytes],
    base_url: str,
    documents: list[PatentDocument],
    request_timeout: float,
) -> dict[str, Any]:
    start_gate = threading.Event()
    accepted_before = int(get_json(f"{base_url}/metrics")["accepted"])
    request_count = 24

    def submit(index: int) -> RequestResult:
        start_gate.wait()
        return post_search(
            base_url,
            documents[index % len(documents)],
            QUERIES[index % len(QUERIES)],
            request_timeout,
            1_000_000 + index,
            max_attempts=1,
        )

    with concurrent.futures.ThreadPoolExecutor(max_workers=request_count) as executor:
        futures = [executor.submit(submit, index) for index in range(request_count)]
        start_gate.set()
        admission_deadline = time.monotonic() + 15
        accepted_at_signal = accepted_before
        while time.monotonic() < admission_deadline:
            accepted_at_signal = int(get_json(f"{base_url}/metrics")["accepted"])
            if accepted_at_signal - accepted_before >= len(futures):
                break
            time.sleep(0.001)
        if accepted_at_signal - accepted_before < len(futures):
            raise TimeoutError("drain requests did not reach the inference queue")
        pending_at_signal = sum(not future.done() for future in futures)
        started = time.perf_counter()
        process.send_signal(signal.SIGTERM)
        results = [future.result() for future in futures]
    process.wait(timeout=240)
    shutdown_seconds = time.perf_counter() - started
    statuses = Counter(str(result.status) for result in results)
    return {
        "offered_requests": len(results),
        "status_counts": dict(sorted(statuses.items())),
        "accepted_before_signal": accepted_at_signal - accepted_before,
        "pending_at_signal": pending_at_signal,
        "shutdown_seconds": shutdown_seconds,
        "master_exit_code": process.returncode,
        "all_accepted_requests_completed": all(
            result.status == 200 for result in results
        ),
    }


def run_scenario(
    root: Path,
    worker_count: int,
    port: int,
    documents: list[PatentDocument],
    args: argparse.Namespace,
) -> dict[str, Any]:
    process, log = start_server(
        root,
        worker_count,
        port,
        args.model_profile,
        args.device,
        args.web_threads,
    )
    base_url = f"http://127.0.0.1:{port}"
    try:
        startup_seconds, observed_worker_pids = wait_for_workers(
            base_url,
            worker_count,
            process,
            timeout=240,
        )
        idle_memory = process_tree_rss(process.pid)
        load = run_load(
            base_url,
            documents,
            args.duration_seconds,
            args.concurrency,
            args.request_timeout,
            process.pid,
        )
        post_load_memory = process_tree_rss(process.pid)
        if worker_count == 1:
            drain = run_drain_probe(process, base_url, documents, args.request_timeout)
        else:
            started = time.perf_counter()
            process.send_signal(signal.SIGTERM)
            process.wait(timeout=240)
            drain = {
                "offered_requests": 0,
                "shutdown_seconds": time.perf_counter() - started,
                "master_exit_code": process.returncode,
                "note": "The in-flight drain probe runs on the recommended one-worker configuration.",
            }
        return {
            "web_workers": worker_count,
            "model_replicas": worker_count,
            "http_threads_per_worker": args.web_threads,
            "startup_seconds": startup_seconds,
            "observed_worker_process_ids": observed_worker_pids,
            "idle_process_tree_memory": idle_memory,
            "load": load,
            "post_load_process_tree_memory": post_load_memory,
            "drain_probe": drain,
        }
    except Exception:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
            except subprocess.TimeoutExpired:
                process.kill()
        log.seek(0)
        logs = log.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"scenario failed for {worker_count} workers\n{logs[-8_000:]}"
        )
    finally:
        log.close()


def main() -> None:
    args = parse_args()
    if args.duration_seconds <= 0 or args.concurrency < 1:
        raise ValueError("duration and concurrency must be positive")
    if any(worker_count < 1 for worker_count in args.worker_counts):
        raise ValueError("worker counts must be positive")

    root = Path(__file__).resolve().parents[1]
    documents = load_corpus(args.demo_record, args.patent_html_dir)
    scenarios = [
        run_scenario(
            root,
            worker_count,
            args.base_port + index,
            documents,
            args,
        )
        for index, worker_count in enumerate(args.worker_counts)
    ]
    one_worker = next(
        (scenario for scenario in scenarios if scenario["web_workers"] == 1),
        None,
    )
    two_workers = next(
        (scenario for scenario in scenarios if scenario["web_workers"] == 2),
        None,
    )
    report = {
        "created_at": datetime.now(UTC).isoformat(),
        "target": "one physical server",
        "model_profile": args.model_profile,
        "device": args.device,
        "corpus": [
            {
                "identifier": document.identifier,
                "source_url": document.source_url,
                "characters": len(document.text),
            }
            for document in documents
        ],
        "scenarios": scenarios,
        "comparison": {
            "two_to_one_worker_memory_ratio": (
                two_workers["post_load_process_tree_memory"]["total_rss_bytes"]
                / one_worker["post_load_process_tree_memory"]["total_rss_bytes"]
                if one_worker and two_workers
                else None
            ),
            "two_to_one_worker_throughput_ratio": (
                two_workers["load"]["successful_requests_per_second"]
                / one_worker["load"]["successful_requests_per_second"]
                if one_worker and two_workers
                else None
            ),
        },
        "limits": [
            "Each Gunicorn worker has one model replica, one cache, and one queue.",
            "Process RSS double-counts shared memory pages and is a conservative host-capacity measure.",
            "The corpus has three public patent descriptions and starts with an empty in-process cache.",
            "The run measures one local server and does not represent a multi-host deployment.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), **report["comparison"]}, indent=2))


if __name__ == "__main__":
    main()
