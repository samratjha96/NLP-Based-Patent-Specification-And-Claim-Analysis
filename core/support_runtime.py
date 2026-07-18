"""Persistent, cross-request batched support-search inference."""

from __future__ import annotations

import hashlib
from collections import OrderedDict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

import numpy as np
import spacy
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder, SentenceTransformer

from config import SPACY_CACHE_DIR
from core import support_search


@dataclass(frozen=True)
class ModelProfile:
    name: str
    embedder: str
    reranker: str | None
    use_bm25: bool
    candidate_count: int = 200


MODEL_PROFILES = {
    "baseline": ModelProfile(
        name="baseline",
        embedder="BAAI/bge-m3",
        reranker="BAAI/bge-reranker-large",
        use_bm25=True,
    ),
    "balanced": ModelProfile(
        name="balanced",
        embedder="Alibaba-NLP/gte-modernbert-base",
        reranker=None,
        use_bm25=False,
    ),
    "throughput": ModelProfile(
        name="throughput",
        embedder="mixedbread-ai/mxbai-embed-xsmall-v1",
        reranker=None,
        use_bm25=True,
    ),
}


@dataclass(frozen=True)
class SupportRequest:
    patent_text: str
    queries: tuple[str, ...]
    top_n: int
    request_id: str

    def __post_init__(self) -> None:
        if not self.patent_text:
            raise ValueError("patent_text is required")
        if not self.queries:
            raise ValueError("at least one query is required")
        if self.top_n < 1:
            raise ValueError("top_n must be positive")


@dataclass
class _DocumentIndex:
    sentences: list[str]
    meta: list[tuple[int, int]]
    bm25: BM25Okapi
    embeddings: np.ndarray


@dataclass
class _QueryPlan:
    query: str
    document: _DocumentIndex
    candidate_ids: list[int]
    scores: np.ndarray


class SupportAnalyzer:
    """Load models once and batch embeddings and reranking across requests."""

    def __init__(
        self,
        *,
        profile: ModelProfile,
        device: str | None = None,
        spacy_model: str = "en_core_web_sm",
        embedding_batch_size: int = 256,
        reranker_batch_size: int = 32,
        index_cache_size: int = 4,
        nlp: Any | None = None,
        embedder: Any | None = None,
        reranker: Any | None = None,
    ) -> None:
        if index_cache_size < 0:
            raise ValueError("index_cache_size cannot be negative")
        self.profile = profile
        self.device = device or support_search.default_device()
        self.embedding_batch_size = embedding_batch_size
        self.reranker_batch_size = reranker_batch_size
        self.index_cache_size = index_cache_size
        self._index_cache: OrderedDict[str, _DocumentIndex] = OrderedDict()
        self._index_cache_hits = 0
        self._index_cache_misses = 0
        self.nlp = nlp or self._load_spacy(spacy_model)
        self.embedder = embedder or SentenceTransformer(
            profile.embedder, device=self.device
        )
        self.reranker = reranker
        if profile.reranker and self.reranker is None:
            self.reranker = CrossEncoder(profile.reranker, device=self.device)

    def analyze_batch(self, requests: Sequence[SupportRequest]) -> list[dict[str, Any]]:
        if not requests:
            return []

        documents = self._build_document_indexes(requests)
        query_embeddings = self._embed_unique_queries(requests)
        plans_by_request: list[list[_QueryPlan]] = []
        all_plans: list[_QueryPlan] = []

        for request in requests:
            document = documents[request.patent_text]
            request_plans = [
                self._plan_query(query, query_embeddings[query], document)
                for query in request.queries
            ]
            plans_by_request.append(request_plans)
            all_plans.extend(request_plans)

        if self.reranker is not None:
            self._rerank(all_plans)

        responses = []
        for request, plans in zip(requests, plans_by_request):
            responses.append(
                {
                    "request_id": request.request_id,
                    "profile": self.profile.name,
                    "results": [
                        {
                            "query": plan.query,
                            "hits": self._hits(plan, request.top_n),
                        }
                        for plan in plans
                    ],
                }
            )
        return responses

    def cache_snapshot(self) -> dict[str, int]:
        return {
            "index_cache_entries": len(self._index_cache),
            "index_cache_hits": self._index_cache_hits,
            "index_cache_misses": self._index_cache_misses,
        }

    def _build_document_indexes(
        self, requests: Sequence[SupportRequest]
    ) -> dict[str, _DocumentIndex]:
        indexes: dict[str, _DocumentIndex] = {}
        split_documents: dict[str, tuple[list[str], list[tuple[int, int]]]] = {}
        for request in requests:
            if request.patent_text in indexes or request.patent_text in split_documents:
                continue
            cache_key = self._cache_key(request.patent_text)
            cached = self._index_cache.get(cache_key)
            if cached is not None:
                self._index_cache.move_to_end(cache_key)
                self._index_cache_hits += 1
                indexes[request.patent_text] = cached
                continue
            self._index_cache_misses += 1
            split_documents[request.patent_text] = self._split_document(
                request.patent_text
            )

        all_sentences = [
            sentence
            for sentences, _meta in split_documents.values()
            for sentence in sentences
        ]
        embeddings = self._encode(all_sentences) if all_sentences else None

        offset = 0
        if split_documents:
            assert embeddings is not None
        for patent_text, (sentences, meta) in split_documents.items():
            next_offset = offset + len(sentences)
            document = _DocumentIndex(
                sentences=sentences,
                meta=meta,
                bm25=BM25Okapi(
                    [support_search.bm25_tokenize(sentence) for sentence in sentences]
                ),
                embeddings=embeddings[offset:next_offset],
            )
            indexes[patent_text] = document
            self._cache_document(self._cache_key(patent_text), document)
            offset = next_offset
        return indexes

    def _cache_document(self, key: str, document: _DocumentIndex) -> None:
        if self.index_cache_size == 0:
            return
        self._index_cache[key] = document
        self._index_cache.move_to_end(key)
        while len(self._index_cache) > self.index_cache_size:
            self._index_cache.popitem(last=False)

    @staticmethod
    def _cache_key(patent_text: str) -> str:
        return hashlib.sha256(patent_text.encode("utf-8")).hexdigest()

    def _embed_unique_queries(
        self, requests: Sequence[SupportRequest]
    ) -> dict[str, np.ndarray]:
        queries = list(
            dict.fromkeys(query for request in requests for query in request.queries)
        )
        embeddings = self._encode(queries)
        return dict(zip(queries, embeddings))

    def _split_document(
        self, patent_text: str
    ) -> tuple[list[str], list[tuple[int, int]]]:
        sentences: list[str] = []
        meta: list[tuple[int, int]] = []
        for paragraph_id, paragraph in enumerate(
            support_search.split_paragraphs(patent_text)
        ):
            for sentence_id, sentence in enumerate(
                support_search.split_sentences_with_nlp(paragraph, self.nlp)
            ):
                sentences.append(sentence)
                meta.append((paragraph_id, sentence_id))
        if not sentences:
            raise ValueError("no sentences extracted from patent_text")
        return sentences, meta

    def _encode(self, texts: list[str]) -> np.ndarray:
        return np.asarray(
            self.embedder.encode(
                texts,
                batch_size=self.embedding_batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True,
            ),
            dtype=np.float32,
        )

    def _plan_query(
        self,
        query: str,
        query_embedding: np.ndarray,
        document: _DocumentIndex,
    ) -> _QueryPlan:
        dense_scores = np.asarray(
            document.embeddings @ query_embedding, dtype=np.float32
        )
        candidate_count = min(self.profile.candidate_count, len(document.sentences))

        if self.profile.use_bm25:
            bm25_hits = support_search.bm25_retrieve(
                query, document.bm25, k=candidate_count
            )
            dense_ids = support_search.topk_indices(dense_scores, candidate_count)
            dense_hits = [
                (int(index), float(dense_scores[index])) for index in dense_ids
            ]
            fused = support_search.rrf_fuse(
                bm25_hits,
                dense_hits,
                top_n=candidate_count,
            )
            candidate_ids = [index for index, _score in fused]
            scores = np.asarray([score for _index, score in fused], dtype=np.float32)
        else:
            candidate_ids = [
                int(index)
                for index in support_search.topk_indices(dense_scores, candidate_count)
            ]
            scores = dense_scores[candidate_ids]

        return _QueryPlan(query, document, candidate_ids, scores)

    def _rerank(self, plans: list[_QueryPlan]) -> None:
        reranker = self.reranker
        if reranker is None:
            return
        pairs = [
            (plan.query, plan.document.sentences[candidate_id])
            for plan in plans
            for candidate_id in plan.candidate_ids
        ]
        if not pairs:
            return
        all_scores = np.asarray(
            reranker.predict(
                pairs,
                batch_size=self.reranker_batch_size,
            ),
            dtype=np.float32,
        )
        offset = 0
        for plan in plans:
            next_offset = offset + len(plan.candidate_ids)
            plan.scores = all_scores[offset:next_offset]
            offset = next_offset

    @staticmethod
    def _hits(plan: _QueryPlan, top_n: int) -> list[dict[str, Any]]:
        count = min(top_n, len(plan.candidate_ids))
        order = support_search.topk_indices(plan.scores, count)
        hits = []
        for score_index in order:
            candidate_id = plan.candidate_ids[int(score_index)]
            paragraph_id, sentence_id = plan.document.meta[candidate_id]
            hits.append(
                {
                    "paragraph_id": paragraph_id,
                    "sentence_id": sentence_id,
                    "sentence_global_idx": candidate_id,
                    "sentence": plan.document.sentences[candidate_id],
                    "score": float(plan.scores[int(score_index)]),
                }
            )
        return hits

    @staticmethod
    def _load_spacy(model_name: str) -> Any:
        cached_path = Path(SPACY_CACHE_DIR) / model_name
        return spacy.load(
            cached_path if cached_path.exists() else model_name, disable=["ner"]
        )
