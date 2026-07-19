"""HTTP inference service with bounded admission and cross-request batching."""

from __future__ import annotations

import atexit
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request, send_from_directory

from core.antecedent_basis import analyze_intro_ref
from core.batch_queue import (
    BatchProcessor,
    ProcessorClosed,
    QueueAtCapacity,
    WorkTimeout,
)
from core.claim_segmentation import get_nlp as get_claim_nlp
from core.claim_segmentation import segment_claim
from core.support_runtime import MODEL_PROFILES, SupportAnalyzer, SupportRequest


LOGGER = logging.getLogger("patentagility.service")
WEB_DIR = Path(__file__).resolve().parent / "web"


@dataclass(frozen=True)
class ServiceSettings:
    queue_capacity: int = 32
    max_batch_size: int = 8
    max_batch_characters: int = 4_000_000
    batch_window_seconds: float = 0.02
    request_timeout_seconds: float = 120
    retry_after_seconds: int = 2
    max_patent_characters: int = 2_000_000
    max_queries: int = 64
    max_query_characters: int = 4_096
    max_results: int = 50
    model_profile: str = "balanced"
    spacy_model: str = "en_core_web_sm"
    embedding_batch_size: int = 256
    reranker_batch_size: int = 32
    index_cache_size: int = 4

    @classmethod
    def from_env(cls) -> "ServiceSettings":
        return cls(
            queue_capacity=int(os.environ.get("PATENTAGILITY_QUEUE_CAPACITY", "32")),
            max_batch_size=int(os.environ.get("PATENTAGILITY_MAX_BATCH_SIZE", "8")),
            max_batch_characters=int(
                os.environ.get("PATENTAGILITY_MAX_BATCH_CHARACTERS", "4000000")
            ),
            batch_window_seconds=float(
                os.environ.get("PATENTAGILITY_BATCH_WINDOW_MS", "20")
            )
            / 1_000,
            request_timeout_seconds=float(
                os.environ.get("PATENTAGILITY_REQUEST_TIMEOUT_SECONDS", "120")
            ),
            retry_after_seconds=int(
                os.environ.get("PATENTAGILITY_RETRY_AFTER_SECONDS", "2")
            ),
            max_patent_characters=int(
                os.environ.get("PATENTAGILITY_MAX_PATENT_CHARACTERS", "2000000")
            ),
            max_queries=int(os.environ.get("PATENTAGILITY_MAX_QUERIES", "64")),
            max_query_characters=int(
                os.environ.get("PATENTAGILITY_MAX_QUERY_CHARACTERS", "4096")
            ),
            max_results=int(os.environ.get("PATENTAGILITY_MAX_RESULTS", "50")),
            model_profile=os.environ.get("PATENTAGILITY_MODEL_PROFILE", "balanced"),
            spacy_model=os.environ.get("PATENTAGILITY_SPACY_MODEL", "en_core_web_sm"),
            embedding_batch_size=int(
                os.environ.get("PATENTAGILITY_EMBEDDING_BATCH_SIZE", "256")
            ),
            reranker_batch_size=int(
                os.environ.get("PATENTAGILITY_RERANKER_BATCH_SIZE", "32")
            ),
            index_cache_size=int(os.environ.get("PATENTAGILITY_INDEX_CACHE_SIZE", "4")),
        )


def create_app(
    *,
    settings: ServiceSettings | None = None,
    processor: Any | None = None,
) -> Flask:
    settings = settings or ServiceSettings.from_env()
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = (
        settings.max_patent_characters
        + settings.max_queries * settings.max_query_characters
        + 65_536
    )

    owns_processor = processor is None
    analyzer = None
    if processor is None:
        try:
            profile = MODEL_PROFILES[settings.model_profile]
        except KeyError as exc:
            choices = ", ".join(sorted(MODEL_PROFILES))
            raise ValueError(
                f"unknown model profile {settings.model_profile!r}; choose {choices}"
            ) from exc
        analyzer = SupportAnalyzer(
            profile=profile,
            spacy_model=settings.spacy_model,
            embedding_batch_size=settings.embedding_batch_size,
            reranker_batch_size=settings.reranker_batch_size,
            index_cache_size=settings.index_cache_size,
        )
        processor = BatchProcessor(
            analyzer.analyze_batch,
            capacity=settings.queue_capacity,
            max_batch_size=settings.max_batch_size,
            batch_window_seconds=settings.batch_window_seconds,
            item_cost=_request_cost,
            max_batch_cost=settings.max_batch_characters,
        )

    if owns_processor:
        atexit.register(processor.close)

    @app.errorhandler(413)
    def request_too_large(_error):
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        return _response(
            {
                "error": "request_too_large",
                "message": "request body exceeds the configured size limit",
            },
            status=413,
            request_id=request_id,
        )

    @app.get("/health/live")
    def live():
        status = 200 if processor.is_alive else 503
        return jsonify({"alive": bool(processor.is_alive)}), status

    @app.get("/health/ready")
    def ready():
        is_ready = bool(processor.accepting and processor.is_alive)
        return jsonify({"ready": is_ready}), 200 if is_ready else 503

    @app.get("/metrics")
    def metrics():
        snapshot = processor.snapshot()
        snapshot["model_profile"] = settings.model_profile
        if analyzer is not None:
            snapshot.update(analyzer.cache_snapshot())
        return jsonify(snapshot)

    @app.get("/")
    def frontend():
        return send_from_directory(WEB_DIR, "index.html")

    @app.get("/app/<path:filename>")
    def frontend_asset(filename: str):
        return send_from_directory(WEB_DIR, filename)

    @app.post("/v1/support/search")
    def support_search():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        started = time.perf_counter()
        try:
            work = _parse_request(request.get_json(silent=True), request_id, settings)
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )

        try:
            result = processor.submit(
                work,
                timeout=settings.request_timeout_seconds,
            )
        except QueueAtCapacity:
            _log("request_rejected", request_id=request_id, reason="queue_full")
            response = _response(
                {"error": "overloaded", "message": "inference queue is full"},
                status=429,
                request_id=request_id,
            )
            response.headers["Retry-After"] = str(settings.retry_after_seconds)
            return response
        except WorkTimeout:
            _log("request_timed_out", request_id=request_id)
            return _response(
                {
                    "error": "deadline_exceeded",
                    "message": "inference did not finish before the request deadline",
                },
                status=504,
                request_id=request_id,
            )
        except ProcessorClosed:
            return _response(
                {"error": "unavailable", "message": "inference service is draining"},
                status=503,
                request_id=request_id,
            )
        except RuntimeError:
            LOGGER.exception(
                json.dumps({"event": "request_failed", "request_id": request_id})
            )
            return _response(
                {"error": "inference_failed", "message": "inference failed"},
                status=500,
                request_id=request_id,
            )

        duration = time.perf_counter() - started
        _log(
            "request_completed",
            request_id=request_id,
            duration_seconds=duration,
            query_count=len(work.queries),
        )
        return _response(result, status=200, request_id=request_id)

    @app.post("/v1/claims/antecedent")
    def antecedent_basis():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        try:
            claim_text = _parse_claim_text(request.get_json(silent=True))
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )

        analysis = analyze_intro_ref(claim_text)
        issues = [
            {
                "code": "missing_antecedent",
                "severity": "high",
                "title": "Missing antecedent basis",
                **_mention_payload(mention),
            }
            for mention in analysis["used_without_intro"]
        ]
        issues.extend(
            {
                "code": "introduced_not_reused",
                "severity": "info",
                "title": "Introduced but not later referenced",
                **_mention_payload(mention),
            }
            for mention in analysis["introduced_never_referenced"]
        )
        summary = {
            "high": sum(issue["severity"] == "high" for issue in issues),
            "info": sum(issue["severity"] == "info" for issue in issues),
            "total": len(issues),
        }
        return _response(
            {
                "claim_text": claim_text,
                "mentions": [
                    _mention_payload(mention) for mention in analysis["mentions"]
                ],
                "issues": issues,
                "summary": summary,
            },
            status=200,
            request_id=request_id,
        )

    @app.post("/v1/claims/diagram")
    def claim_diagram():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        try:
            claim_text = _parse_claim_text(request.get_json(silent=True))
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )

        analysis = segment_claim(
            claim_text,
            nlp=get_claim_nlp(settings.spacy_model),
        )
        return _response(
            {
                "claim_text": claim_text,
                "segment_count": len(analysis["segments"]),
                "segments": analysis["segments"],
                "frames": analysis["frames"],
            },
            status=200,
            request_id=request_id,
        )

    return app


def _parse_request(
    payload: Any,
    request_id: str,
    settings: ServiceSettings,
) -> SupportRequest:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")

    patent_text = payload.get("patent_text")
    if not isinstance(patent_text, str) or not patent_text.strip():
        raise ValueError("patent_text must be a non-empty string")
    if len(patent_text) > settings.max_patent_characters:
        raise ValueError("patent_text exceeds the configured size limit")

    query = payload.get("query")
    queries = payload.get("queries")
    if query is not None and queries is not None:
        raise ValueError("provide query or queries, not both")
    if query is not None:
        queries = [query]
    if not isinstance(queries, list) or not queries:
        raise ValueError("at least one query is required")
    if len(queries) > settings.max_queries:
        raise ValueError("too many queries")
    if any(not isinstance(item, str) or not item.strip() for item in queries):
        raise ValueError("queries must contain non-empty strings")
    if any(len(item) > settings.max_query_characters for item in queries):
        raise ValueError("a query exceeds the configured size limit")

    top_n = payload.get("top_n", min(20, settings.max_results))
    if type(top_n) is not int or not 1 <= top_n <= settings.max_results:
        raise ValueError(
            f"top_n must be an integer between 1 and {settings.max_results}"
        )

    return SupportRequest(
        patent_text=patent_text.strip(),
        queries=tuple(item.strip() for item in queries),
        top_n=top_n,
        request_id=request_id,
    )


def _response(payload: Any, *, status: int, request_id: str):
    response = jsonify(payload)
    response.status_code = status
    response.headers["X-Request-ID"] = request_id
    return response


def _parse_claim_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    claim_text = payload.get("claim_text")
    if not isinstance(claim_text, str) or not claim_text.strip():
        raise ValueError("claim_text must be a non-empty string")
    claim_text = claim_text.strip()
    if len(claim_text) > 100_000:
        raise ValueError("claim_text exceeds the 100,000 character limit")
    return claim_text


def _mention_payload(mention: Any) -> dict[str, Any]:
    return {
        "kind": mention.kind,
        "text": mention.text,
        "key": mention.key,
        "start": mention.start,
        "end": mention.end,
    }


def _request_cost(work: SupportRequest) -> int:
    return len(work.patent_text) + sum(len(query) for query in work.queries)


def _log(event: str, **fields: Any) -> None:
    LOGGER.info(json.dumps({"event": event, **fields}, sort_keys=True))


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    app = create_app()
    app.run(
        host=os.environ.get("PATENTAGILITY_HOST", "127.0.0.1"),
        port=int(os.environ.get("PATENTAGILITY_PORT", "8000")),
        threaded=True,
    )


if __name__ == "__main__":
    main()
