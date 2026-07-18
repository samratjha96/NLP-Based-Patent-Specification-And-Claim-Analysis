import numpy as np
import spacy

from core.support_runtime import MODEL_PROFILES, SupportAnalyzer, SupportRequest


class FakeEmbedder:
    def __init__(self):
        self.calls = []

    def encode(self, texts, **_kwargs):
        self.calls.append(list(texts))
        vectors = []
        for text in texts:
            lowered = text.lower()
            vectors.append(
                [
                    int("processor" in lowered or "cpu" in lowered),
                    int("battery" in lowered or "power" in lowered),
                ]
            )
        values = np.asarray(vectors, dtype=np.float32)
        norms = np.linalg.norm(values, axis=1, keepdims=True)
        return values / np.maximum(norms, 1)


def test_profiles_capture_benchmarked_quality_and_throughput_choices():
    assert MODEL_PROFILES["balanced"].embedder == "Alibaba-NLP/gte-modernbert-base"
    assert MODEL_PROFILES["balanced"].reranker is None
    assert not MODEL_PROFILES["balanced"].use_bm25
    assert (
        MODEL_PROFILES["throughput"].embedder == "mixedbread-ai/mxbai-embed-xsmall-v1"
    )
    assert MODEL_PROFILES["throughput"].reranker is None


def test_analyzer_deduplicates_documents_and_queries_across_a_batch():
    nlp = spacy.blank("en")
    nlp.add_pipe("sentencizer")
    embedder = FakeEmbedder()
    analyzer = SupportAnalyzer(
        profile=MODEL_PROFILES["balanced"],
        nlp=nlp,
        embedder=embedder,
    )
    patent_text = (
        "A processor is coupled to memory.\n\n"
        "A rechargeable battery supplies power to the housing."
    )
    requests = [
        SupportRequest(patent_text, ("cpu memory",), top_n=1, request_id="one"),
        SupportRequest(patent_text, ("cpu memory",), top_n=1, request_id="two"),
    ]

    first, second = analyzer.analyze_batch(requests)

    assert first["results"][0]["hits"][0]["sentence"].startswith("A processor")
    assert second["results"] == first["results"]
    assert len(embedder.calls) == 2
    assert len(embedder.calls[0]) == 2
    assert embedder.calls[1] == ["cpu memory"]


def test_analyzer_reuses_a_bounded_document_index_cache():
    nlp = spacy.blank("en")
    nlp.add_pipe("sentencizer")
    embedder = FakeEmbedder()
    analyzer = SupportAnalyzer(
        profile=MODEL_PROFILES["balanced"],
        nlp=nlp,
        embedder=embedder,
        index_cache_size=1,
    )
    request = SupportRequest(
        "A processor accesses memory.",
        ("cpu",),
        top_n=1,
        request_id="cached",
    )

    analyzer.analyze_batch([request])
    analyzer.analyze_batch([request])

    assert len(embedder.calls) == 3
    assert analyzer.cache_snapshot() == {
        "index_cache_entries": 1,
        "index_cache_hits": 1,
        "index_cache_misses": 1,
    }
