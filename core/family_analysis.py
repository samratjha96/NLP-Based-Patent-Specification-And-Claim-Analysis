"""Claim-family comparison and specification-concept coverage helpers."""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

from core.claim_diff import diff_claim_text


def compare_family_claims(claims: list[dict[str, Any]]) -> dict[str, Any]:
    if len(claims) < 2:
        raise ValueError("at least two family claims are required")

    analyzed = [
        {
            **claim,
            "limitations": split_claim_limitations(claim["claim_text"]),
            "claim_summary": summarize_claim(claim["claim_text"]),
        }
        for claim in claims
    ]
    documents = _group_claims_by_document(analyzed)
    if len(documents) < 2:
        raise ValueError("claims from at least two family documents are required")

    baseline_document = documents[0]
    comparison_document = documents[1]
    alignments = []
    all_shared: list[dict[str, Any]] = []
    all_added: list[dict[str, Any]] = []
    all_removed: list[dict[str, Any]] = []
    row_count = max(
        len(baseline_document["claims"]),
        len(comparison_document["claims"]),
    )
    for position in range(row_count):
        baseline = _claim_at(baseline_document["claims"], position)
        comparison = _claim_at(comparison_document["claims"], position)
        row = _compare_claim_pair(baseline, comparison)
        row["position"] = position + 1
        alignments.append(row)
        all_shared.extend(row["shared"])
        all_added.extend(row["added"])
        all_removed.extend(row["removed"])

    changed = [item for item in all_shared if item["changed"]]
    return {
        "comparison_version": 2,
        "claims": analyzed,
        "documents": documents,
        "alignments": alignments,
        "shared": all_shared,
        "added": all_added,
        "removed": all_removed,
        "summary": {
            "claim_count": len(analyzed),
            "document_count": len(documents),
            "comparison_rows": len(alignments),
            "shared_limitations": len(all_shared) - len(changed),
            "changed_limitations": len(changed),
            "added_limitations": len(all_added),
            "removed_limitations": len(all_removed),
        },
    }


def summarize_claim(claim_text: str) -> str:
    limitations = split_claim_limitations(claim_text)
    if not limitations:
        return "No claim language was available."
    preamble = re.sub(r"^\d+\.\s*", "", limitations[0]).strip()
    actions = [
        re.sub(r"^and\s+", "", item, flags=re.IGNORECASE) for item in limitations[1:3]
    ]
    if not actions:
        return preamble
    return f"{preamble}. Principal steps include {'; '.join(actions)}."


def _group_claims_by_document(claims: list[dict[str, Any]]) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for claim in claims:
        key = (claim["label"], claim["document_number"])
        document = by_key.get(key)
        if document is None:
            document = {
                "label": claim["label"],
                "document_number": claim["document_number"],
                "claims": [],
            }
            by_key[key] = document
            documents.append(document)
        document["claims"].append(claim)
    for document in documents:
        document["claims"].sort(key=lambda item: int(item.get("claim_number", 0)))
    return documents


def _claim_at(claims: list[dict[str, Any]], index: int) -> dict[str, Any] | None:
    return claims[index] if index < len(claims) else None


def _compare_claim_pair(
    baseline: dict[str, Any] | None,
    comparison: dict[str, Any] | None,
) -> dict[str, Any]:
    if baseline is None:
        added = [
            {
                "claim_index": 1,
                "claim_number": comparison["claim_number"],
                "limitation_index": index,
                "text": text,
            }
            for index, text in enumerate(comparison["limitations"])
        ]
        return _claim_pair_result(baseline, comparison, [], added, [])
    if comparison is None:
        removed = [
            {
                "claim_index": 0,
                "claim_number": baseline["claim_number"],
                "limitation_index": index,
                "text": text,
            }
            for index, text in enumerate(baseline["limitations"])
        ]
        return _claim_pair_result(baseline, comparison, [], [], removed)

    matched_right: set[int] = set()
    shared: list[dict[str, Any]] = []
    removed: list[dict[str, Any]] = []

    for left_index, left_text in enumerate(baseline["limitations"]):
        match = _best_match(left_text, comparison["limitations"], matched_right)
        if match is None or match[1] < 0.48:
            removed.append(
                {
                    "claim_index": 0,
                    "claim_number": baseline["claim_number"],
                    "limitation_index": left_index,
                    "text": left_text,
                }
            )
            continue
        right_index, similarity = match
        matched_right.add(right_index)
        right_text = comparison["limitations"][right_index]
        changed = similarity < 0.92
        shared_item = {
            "left_index": left_index,
            "right_index": right_index,
            "baseline_claim_number": baseline["claim_number"],
            "comparison_claim_number": comparison["claim_number"],
            "left_text": left_text,
            "right_text": right_text,
            "similarity": round(similarity, 3),
            "changed": changed,
        }
        if changed:
            shared_item["diff"] = diff_claim_text(left_text, right_text)
        shared.append(shared_item)

    added = [
        {
            "claim_index": 1,
            "claim_number": comparison["claim_number"],
            "limitation_index": index,
            "text": text,
        }
        for index, text in enumerate(comparison["limitations"])
        if index not in matched_right
    ]
    return _claim_pair_result(baseline, comparison, shared, added, removed)


def _claim_pair_result(
    baseline: dict[str, Any] | None,
    comparison: dict[str, Any] | None,
    shared: list[dict[str, Any]],
    added: list[dict[str, Any]],
    removed: list[dict[str, Any]],
) -> dict[str, Any]:
    changed = [item for item in shared if item["changed"]]
    if baseline is None:
        scope = "Later-family claim only"
    elif comparison is None:
        scope = "Parent-family claim only"
    elif added and not removed:
        scope = "Adds limitation blocks"
    elif removed and not added:
        scope = "Removes limitation blocks"
    elif added or removed or changed:
        scope = "Reframes claim scope"
    else:
        scope = "Substantially aligned"
    difference_summary = (
        f"{scope}. {len(changed)} limitation block(s) changed, "
        f"{len(added)} added, and {len(removed)} removed."
    )
    return {
        "baseline_claim": baseline,
        "comparison_claim": comparison,
        "shared": shared,
        "added": added,
        "removed": removed,
        "scope_label": scope,
        "difference_summary": difference_summary,
        "summary": {
            "shared_limitations": len(shared) - len(changed),
            "changed_limitations": len(changed),
            "added_limitations": len(added),
            "removed_limitations": len(removed),
        },
    }


def split_claim_limitations(claim_text: str) -> list[str]:
    text = re.sub(r"\s+", " ", claim_text).strip()
    parts = re.split(r"\s*;\s*(?:and\s+)?|\s*:\s*", text)
    return [part.strip(" ,.;") for part in parts if part.strip(" ,.;")]


def build_coverage_review(
    claims: list[dict[str, Any]],
    concepts: list[dict[str, Any]],
    support_result: dict[str, Any],
    *,
    paragraph_claim_indexes: list[int] | None = None,
) -> dict[str, Any]:
    paragraph_claim_indexes = paragraph_claim_indexes or list(range(len(claims)))
    reviewed = []
    result_groups = support_result.get("results", [])
    for index, concept in enumerate(concepts):
        group = result_groups[index] if index < len(result_groups) else {"hits": []}
        by_claim: dict[int, dict[str, Any]] = {}
        for hit in group.get("hits", []):
            paragraph_id = int(hit.get("paragraph_id", -1))
            if not 0 <= paragraph_id < len(paragraph_claim_indexes):
                continue
            claim_index = paragraph_claim_indexes[paragraph_id]
            if not 0 <= claim_index < len(claims):
                continue
            if (
                claim_index not in by_claim
                or hit["score"] > by_claim[claim_index]["score"]
            ):
                by_claim[claim_index] = hit

        matches = [
            {
                "label": claims[claim_index]["label"],
                "document_number": claims[claim_index]["document_number"],
                "score": round(float(hit["score"]), 4),
                "passage": hit["sentence"],
            }
            for claim_index, hit in sorted(by_claim.items())
        ]
        matches.sort(key=lambda item: item["score"], reverse=True)
        reviewed.append(
            {
                **concept,
                "query": group.get("query", concept["title"]),
                "closest_match": matches[0] if matches else None,
                "claim_matches": matches,
            }
        )

    return {
        "profile": support_result.get("profile"),
        "concepts": reviewed,
        "claim_count": len(claims),
    }


def _best_match(
    source: str,
    candidates: list[str],
    excluded: set[int],
) -> tuple[int, float] | None:
    matches = [
        (index, _similarity(source, candidate))
        for index, candidate in enumerate(candidates)
        if index not in excluded
    ]
    return max(matches, key=lambda item: item[1], default=None)


def _similarity(left: str, right: str) -> float:
    def normalize(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()

    normalized_left = normalize(left)
    normalized_right = normalize(right)
    sequence_score = SequenceMatcher(None, normalized_left, normalized_right).ratio()
    stop_words = {
        "a",
        "an",
        "and",
        "are",
        "at",
        "being",
        "by",
        "comprising",
        "each",
        "for",
        "from",
        "having",
        "in",
        "is",
        "method",
        "of",
        "one",
        "or",
        "the",
        "to",
        "wherein",
        "with",
    }
    left_terms = set(normalized_left.split()) - stop_words
    right_terms = set(normalized_right.split()) - stop_words
    union = left_terms | right_terms
    term_score = len(left_terms & right_terms) / len(union) if union else 0.0
    return max(sequence_score, term_score)
