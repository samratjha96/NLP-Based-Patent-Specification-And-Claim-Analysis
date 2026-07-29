"""HTTP inference service with bounded admission and cross-request batching."""

from __future__ import annotations

import atexit
import json
import logging
import os
import re
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
from core.claim_diff import diff_claim_text
from core.family_analysis import (
    build_coverage_review,
    compare_family_claims,
    split_claim_limitations,
)
from core.patent_records import (
    PatentDataNotConfigured,
    PatentDataUnavailable,
    UsptoPatentLoader,
)
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
    device: str | None = None
    spacy_model: str = "en_core_web_sm"
    embedding_batch_size: int = 256
    reranker_batch_size: int = 32
    index_cache_size: int = 4
    shutdown_timeout_seconds: float = 180
    uspto_api_key: str | None = None

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
            device=os.environ.get("PATENTAGILITY_DEVICE") or None,
            spacy_model=os.environ.get("PATENTAGILITY_SPACY_MODEL", "en_core_web_sm"),
            embedding_batch_size=int(
                os.environ.get("PATENTAGILITY_EMBEDDING_BATCH_SIZE", "256")
            ),
            reranker_batch_size=int(
                os.environ.get("PATENTAGILITY_RERANKER_BATCH_SIZE", "32")
            ),
            index_cache_size=int(os.environ.get("PATENTAGILITY_INDEX_CACHE_SIZE", "4")),
            shutdown_timeout_seconds=float(
                os.environ.get("PATENTAGILITY_SHUTDOWN_TIMEOUT_SECONDS", "180")
            ),
            uspto_api_key=os.environ.get("USPTO_API_KEY"),
        )


def create_app(
    *,
    settings: ServiceSettings | None = None,
    processor: Any | None = None,
    patent_loader: Any | None = None,
) -> Flask:
    settings = settings or ServiceSettings.from_env()
    patent_loader = patent_loader or UsptoPatentLoader(api_key=settings.uspto_api_key)
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = (
        settings.max_patent_characters
        + settings.max_queries * settings.max_query_characters
        + 65_536
    )

    owns_processor = processor is None
    shutdown_started = False
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
            device=settings.device,
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

    def begin_drain() -> None:
        if not owns_processor:
            return
        processor.begin_drain()
        _log("service_draining", process_id=os.getpid())

    def shutdown() -> None:
        nonlocal shutdown_started
        if not owns_processor:
            return
        if shutdown_started:
            return
        shutdown_started = True
        processor.close(drain=True, timeout=settings.shutdown_timeout_seconds)
        _log("service_stopped", process_id=os.getpid())

    app.extensions["patentagility_begin_drain"] = begin_drain
    app.extensions["patentagility_shutdown"] = shutdown

    if owns_processor:
        atexit.register(shutdown)

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
        snapshot["model_device"] = (
            analyzer.device if analyzer is not None else "external"
        )
        snapshot["process_id"] = os.getpid()
        snapshot["configured_web_workers"] = int(
            os.environ.get("PATENTAGILITY_WEB_WORKERS", "1")
        )
        snapshot["model_replicas_in_process"] = int(analyzer is not None)
        snapshot["queue_scope"] = "process"
        if analyzer is not None:
            snapshot.update(analyzer.cache_snapshot())
        return jsonify(snapshot)

    @app.get("/")
    def frontend():
        return send_from_directory(WEB_DIR, "index.html")

    @app.get("/app/<path:filename>")
    def frontend_asset(filename: str):
        return send_from_directory(WEB_DIR, filename)

    @app.post("/v1/patents/lookup")
    def patent_lookup():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        try:
            identifier, identifier_type = _parse_patent_identifier(
                request.get_json(silent=True)
            )
            record = patent_loader.load(
                identifier=identifier,
                identifier_type=identifier_type,
            )
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )
        except PatentDataNotConfigured as exc:
            return _response(
                {"error": "patent_data_unconfigured", "message": str(exc)},
                status=503,
                request_id=request_id,
            )
        except PatentDataUnavailable as exc:
            return _response(
                {"error": "patent_data_unavailable", "message": str(exc)},
                status=502,
                request_id=request_id,
            )

        public_record = {
            key: value
            for key, value in record.items()
            if key not in {"specification_text", "claims_text"}
        }
        public_record["specification_character_count"] = len(
            record.get("specification_text", "")
        )
        public_record["claims_character_count"] = len(record.get("claims_text", ""))
        return _response(public_record, status=200, request_id=request_id)

    @app.post("/v1/support/search")
    def support_search():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        started = time.perf_counter()
        try:
            work = _parse_request(
                request.get_json(silent=True),
                request_id,
                settings,
                patent_loader,
            )
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
            claims = _parse_antecedent_claims(
                request.get_json(silent=True),
                settings,
                patent_loader,
            )
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )

        nlp = get_claim_nlp(settings.spacy_model)
        analyzed_claims = []
        issues = []
        mentions = []
        for claim in claims:
            analysis = analyze_intro_ref(claim["claim_text"], nlp=nlp)
            claim_issues = [
                {
                    "code": "missing_antecedent",
                    "severity": "high",
                    "title": "Missing earlier introduction",
                    **_mention_payload(mention),
                }
                for mention in analysis["used_without_intro"]
            ]
            claim_issues.extend(
                {
                    "code": "introduced_not_reused",
                    "severity": "info",
                    "title": "Introduced but not later referenced",
                    **_mention_payload(mention),
                }
                for mention in analysis["introduced_never_referenced"]
            )
            for issue in claim_issues:
                issue["issue_id"] = f"I{len(issues) + 1:03d}"
                issue["label"] = claim["label"]
                issue["document_number"] = claim["document_number"]
                issue["claim_number"] = claim["claim_number"]
                if issue["severity"] == "high":
                    issue["confidence"] = 0.82
                    issue["confidence_label"] = "Medium"
                    issue["message"] = (
                        f"'{issue['text']}' does not have a clear earlier "
                        f"introduction in claim {claim['claim_number']}."
                    )
                else:
                    issue["confidence"] = 0.68
                    issue["confidence_label"] = "Medium"
                    issue["message"] = (
                        f"'{issue['text']}' is introduced once in claim "
                        f"{claim['claim_number']} and is not referred to again."
                    )
                issues.append(issue)

            claim_mentions = [
                {
                    **_mention_payload(mention),
                    "document_number": claim["document_number"],
                    "claim_number": claim["claim_number"],
                }
                for mention in analysis["mentions"]
            ]
            mentions.extend(claim_mentions)
            analyzed_claims.append(
                {
                    **claim,
                    "mentions": claim_mentions,
                    "issues": claim_issues,
                    "summary": {
                        "high": sum(
                            issue["severity"] == "high" for issue in claim_issues
                        ),
                        "info": sum(
                            issue["severity"] == "info" for issue in claim_issues
                        ),
                        "total": len(claim_issues),
                    },
                }
            )

        summary = {
            "high": sum(issue["severity"] == "high" for issue in issues),
            "info": sum(issue["severity"] == "info" for issue in issues),
            "total": len(issues),
            "claim_count": len(analyzed_claims),
        }
        return _response(
            {
                "antecedent_version": 2,
                "claim_text": analyzed_claims[0]["claim_text"],
                "claims": analyzed_claims,
                "mentions": mentions,
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
            claim_text = _parse_claim_text(
                request.get_json(silent=True),
                patent_loader,
            )
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

    @app.post("/v1/claims/diff")
    def claim_diff():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        try:
            before_text, after_text = _parse_claim_diff(request.get_json(silent=True))
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )

        return _response(
            diff_claim_text(before_text, after_text),
            status=200,
            request_id=request_id,
        )

    @app.post("/v1/family/claims/compare")
    def family_claim_comparison():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        try:
            claims = _parse_family_claims(request.get_json(silent=True), settings)
            result = compare_family_claims(claims)
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )
        return _response(result, status=200, request_id=request_id)

    @app.post("/v1/family/coverage")
    def family_coverage():
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        try:
            payload = request.get_json(silent=True)
            claims = _parse_family_claims(payload, settings)
            concepts = _parse_coverage_concepts(payload, settings)
            claim_paragraphs = []
            paragraph_claim_indexes = []
            for claim_index, claim in enumerate(claims):
                limitations = split_claim_limitations(claim["claim_text"])
                claim_paragraphs.extend(limitations)
                paragraph_claim_indexes.extend([claim_index] * len(limitations))
            work = SupportRequest(
                patent_text="\n\n".join(claim_paragraphs),
                queries=tuple(concept["title"] for concept in concepts),
                top_n=min(settings.max_results, max(8, len(claims) * 4)),
                request_id=request_id,
            )
        except ValueError as exc:
            return _response(
                {"error": "invalid_request", "message": str(exc)},
                status=400,
                request_id=request_id,
            )

        try:
            result = processor.submit(work, timeout=settings.request_timeout_seconds)
        except QueueAtCapacity:
            response = _response(
                {"error": "overloaded", "message": "inference queue is full"},
                status=429,
                request_id=request_id,
            )
            response.headers["Retry-After"] = str(settings.retry_after_seconds)
            return response
        except WorkTimeout:
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
                json.dumps(
                    {"event": "family_coverage_failed", "request_id": request_id}
                )
            )
            return _response(
                {"error": "inference_failed", "message": "inference failed"},
                status=500,
                request_id=request_id,
            )

        return _response(
            build_coverage_review(
                claims,
                concepts,
                result,
                paragraph_claim_indexes=paragraph_claim_indexes,
            ),
            status=200,
            request_id=request_id,
        )

    return app


def _parse_request(
    payload: Any,
    request_id: str,
    settings: ServiceSettings,
    patent_loader: Any,
) -> SupportRequest:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")

    patent_text = payload.get("patent_text")
    document_cache_key = None
    if patent_text is None and payload.get("record_id"):
        record_id = payload["record_id"]
        patent_text = patent_loader.get_text(record_id, "specification")
        document_cache_key = f"public-uspto:{record_id}"
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
        document_cache_key=document_cache_key,
    )


def _response(payload: Any, *, status: int, request_id: str):
    response = jsonify(payload)
    response.status_code = status
    response.headers["X-Request-ID"] = request_id
    return response


def _parse_patent_identifier(payload: Any) -> tuple[str, str]:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    identifier_type = payload.get("identifier_type")
    if identifier_type not in {"application", "patent"}:
        raise ValueError("identifier_type must be application or patent")
    raw_identifier = payload.get("identifier")
    if not isinstance(raw_identifier, str):
        raise ValueError("identifier must be a string")
    identifier = re.sub(r"\D+", "", raw_identifier)
    valid_length = (
        len(identifier) == 8
        if identifier_type == "application"
        else 6 <= len(identifier) <= 8
    )
    if not valid_length:
        raise ValueError(f"identifier is not a valid U.S. {identifier_type} number")
    return identifier, identifier_type


def _parse_claim_text(payload: Any, patent_loader: Any) -> str:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    claim_text = payload.get("claim_text")
    if claim_text is None and payload.get("record_id"):
        claim_text = patent_loader.get_text(payload["record_id"], "claims")
    if not isinstance(claim_text, str) or not claim_text.strip():
        raise ValueError("claim_text must be a non-empty string")
    claim_text = claim_text.strip()
    if len(claim_text) > 100_000:
        raise ValueError("claim_text exceeds the 100,000 character limit")
    return claim_text


def _parse_claim_diff(payload: Any) -> tuple[str, str]:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")

    claim_texts = []
    for field in ("before_claim_text", "after_claim_text"):
        value = payload.get(field)
        if not isinstance(value, str) or not value.strip():
            raise ValueError(f"{field} must be a non-empty string")
        value = value.strip()
        if len(value) > 100_000:
            raise ValueError(f"{field} exceeds the 100,000 character limit")
        claim_texts.append(value)
    return claim_texts[0], claim_texts[1]


def _parse_family_claims(
    payload: Any, settings: ServiceSettings
) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        raise ValueError("request body must be a JSON object")
    claims = payload.get("claims")
    if not isinstance(claims, list) or len(claims) < 2:
        raise ValueError("at least two family claims are required")
    if len(claims) > 32:
        raise ValueError("too many family claims")

    parsed = []
    total_characters = 0
    for claim in claims:
        if not isinstance(claim, dict):
            raise ValueError("each family claim must be an object")
        label = claim.get("label")
        document_number = claim.get("document_number")
        claim_text = claim.get("claim_text")
        if not all(
            isinstance(value, str) and value.strip()
            for value in (label, document_number, claim_text)
        ):
            raise ValueError(
                "each family claim needs a label, document number, and text"
            )
        total_characters += len(claim_text)
        parsed.append(
            {
                "label": label.strip(),
                "document_number": document_number.strip(),
                "claim_number": claim.get("claim_number", 1),
                "claim_text": claim_text.strip(),
            }
        )
    if total_characters > settings.max_patent_characters:
        raise ValueError("family claim text exceeds the configured size limit")
    return parsed


def _parse_antecedent_claims(
    payload: Any,
    settings: ServiceSettings,
    patent_loader: Any,
) -> list[dict[str, Any]]:
    if isinstance(payload, dict) and "claims" in payload:
        return _parse_family_claims(payload, settings)
    return [
        {
            "label": "Loaded patent",
            "document_number": "",
            "claim_number": 1,
            "claim_text": _parse_claim_text(payload, patent_loader),
        }
    ]


def _parse_coverage_concepts(
    payload: Any, settings: ServiceSettings
) -> list[dict[str, str]]:
    concepts = payload.get("concepts") if isinstance(payload, dict) else None
    if not isinstance(concepts, list) or not concepts:
        raise ValueError("at least one specification concept is required")
    if len(concepts) > settings.max_queries:
        raise ValueError("too many specification concepts")

    parsed = []
    for concept in concepts:
        if not isinstance(concept, dict):
            raise ValueError("each specification concept must be an object")
        title = concept.get("title")
        evidence = concept.get("evidence")
        if not all(
            isinstance(value, str) and value.strip() for value in (title, evidence)
        ):
            raise ValueError("each concept needs a title and evidence")
        if len(title) > settings.max_query_characters:
            raise ValueError("a concept title exceeds the configured size limit")
        parsed.append({"title": title.strip(), "evidence": evidence.strip()})
    return parsed


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
