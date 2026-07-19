import pytest

from core.batch_queue import QueueAtCapacity, WorkTimeout
from service import ServiceSettings, create_app


class StubProcessor:
    accepting = True
    is_alive = True

    def __init__(self, *, result=None, error=None):
        self.result = result
        self.error = error
        self.submitted = []

    def submit(self, item, *, timeout):
        self.submitted.append((item, timeout))
        if self.error:
            raise self.error
        return self.result

    def snapshot(self):
        return {"queue_depth": 0, "queue_capacity": 2, "completed": 1}


@pytest.fixture
def settings():
    return ServiceSettings(
        queue_capacity=2,
        max_batch_size=2,
        batch_window_seconds=0.01,
        request_timeout_seconds=5,
        retry_after_seconds=2,
        max_patent_characters=100,
        max_queries=3,
        max_query_characters=40,
        max_results=10,
    )


def test_search_endpoint_submits_validated_work(settings):
    processor = StubProcessor(
        result={
            "profile": "balanced",
            "results": [{"query": "processor memory", "hits": []}],
        }
    )
    app = create_app(settings=settings, processor=processor)

    response = app.test_client().post(
        "/v1/support/search",
        json={
            "patent_text": "A processor is coupled to a memory.",
            "queries": ["processor memory"],
            "top_n": 5,
        },
        headers={"X-Request-ID": "request-123"},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == "request-123"
    assert response.get_json()["profile"] == "balanced"
    submitted, timeout = processor.submitted[0]
    assert submitted.queries == ("processor memory",)
    assert submitted.top_n == 5
    assert timeout == 5


def test_search_endpoint_returns_backpressure_signal(settings):
    processor = StubProcessor(error=QueueAtCapacity("full"))
    app = create_app(settings=settings, processor=processor)

    response = app.test_client().post(
        "/v1/support/search",
        json={"patent_text": "text", "query": "query"},
    )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "2"
    assert response.get_json()["error"] == "overloaded"


def test_search_endpoint_returns_deadline_and_validation_errors(settings):
    processor = StubProcessor(error=WorkTimeout("late"))
    app = create_app(settings=settings, processor=processor)
    client = app.test_client()

    timeout_response = client.post(
        "/v1/support/search",
        json={"patent_text": "text", "query": "query"},
    )
    invalid_response = client.post(
        "/v1/support/search",
        json={"patent_text": "text", "queries": []},
    )

    assert timeout_response.status_code == 504
    assert timeout_response.get_json()["error"] == "deadline_exceeded"
    assert invalid_response.status_code == 400


def test_health_and_metrics_expose_admission_state(settings):
    processor = StubProcessor(result={})
    app = create_app(settings=settings, processor=processor)
    client = app.test_client()

    assert client.get("/health/live").status_code == 200
    assert client.get("/health/ready").status_code == 200
    metrics = client.get("/metrics").get_json()
    assert metrics["queue_capacity"] == 2
    assert metrics["model_profile"] == "balanced"


def test_http_body_limit_rejects_oversized_payload_before_admission(settings):
    processor = StubProcessor(result={})
    app = create_app(settings=settings, processor=processor)

    response = app.test_client().post(
        "/v1/support/search",
        json={"patent_text": "x" * 70_000, "query": "query"},
    )

    assert response.status_code == 413
    assert response.get_json()["error"] == "request_too_large"
    assert processor.submitted == []


def test_frontend_is_served_from_the_inference_service(settings):
    app = create_app(settings=settings, processor=StubProcessor(result={}))
    client = app.test_client()

    response = client.get("/")
    script = client.get("/app/app.js")

    assert response.status_code == 200
    assert b"PatentAgility" in response.data
    assert b"Matter workspace" in response.data
    assert script.status_code == 200
    assert script.mimetype == "text/javascript"


def test_antecedent_endpoint_returns_structured_claim_issues(settings, monkeypatch):
    from core.antecedent_basis import Mention

    missing = Mention("ref", "the controller", "controller", 41, 55)
    unused = Mention("intro", "a processor", "processor", 24, 35)
    monkeypatch.setattr(
        "service.analyze_intro_ref",
        lambda _text: {
            "mentions": [unused, missing],
            "introduced": {"processor": [unused]},
            "refs": [missing],
            "used_without_intro": [missing],
            "introduced_never_referenced": [unused],
        },
    )
    app = create_app(settings=settings, processor=StubProcessor(result={}))

    response = app.test_client().post(
        "/v1/claims/antecedent",
        json={"claim_text": "A system comprising a processor and the controller."},
    )

    assert response.status_code == 200
    assert response.get_json()["summary"] == {"high": 1, "info": 1, "total": 2}
    assert response.get_json()["issues"][0]["text"] == "the controller"
    assert response.get_json()["issues"][0]["severity"] == "high"


def test_claim_analysis_endpoint_returns_structured_claim_map(settings, monkeypatch):
    monkeypatch.setattr(
        "service.segment_claim",
        lambda _text, nlp: {
            "segments": [{"idx": 1, "text": "a processor configured to store data"}],
            "frames": [{"anchor_verb": "store", "object_np": "data"}],
        },
    )
    monkeypatch.setattr("service.get_claim_nlp", lambda _model: object())
    app = create_app(settings=settings, processor=StubProcessor(result={}))

    response = app.test_client().post(
        "/v1/claims/diagram",
        json={"claim_text": "A system comprising a processor configured to store data."},
    )

    assert response.status_code == 200
    assert response.get_json()["segment_count"] == 1
    assert response.get_json()["frames"][0]["anchor_verb"] == "store"


@pytest.mark.parametrize("endpoint", ["/v1/claims/antecedent", "/v1/claims/diagram"])
def test_claim_endpoints_reject_empty_input(settings, endpoint):
    app = create_app(settings=settings, processor=StubProcessor(result={}))

    response = app.test_client().post(endpoint, json={"claim_text": "  "})

    assert response.status_code == 400
    assert response.get_json()["error"] == "invalid_request"
