from core.family_analysis import build_coverage_review, compare_family_claims


PARENT_CLAIM = """1. A method for securely storing content comprising:
providing a set of processor identifiers, wherein each processor has secure enclave capability;
receiving encrypted content and a selected processor identifier;
storing the encrypted content on the selected processor; and
instructing the selected processor to decrypt the content in a secure enclave."""

CONTINUATION_CLAIM = """1. A method for securely storing content comprising:
providing one or more processors having secure enclave capability to a cloud provider;
receiving a set of processor identifiers from a content owner; and
providing a processor-specific public key for each selected processor."""


def test_compare_family_claims_identifies_shared_and_changed_limitations():
    result = compare_family_claims(
        [
            {
                "label": "Parent grant",
                "document_number": "US 9,922,200 B2",
                "claim_number": 1,
                "claim_text": PARENT_CLAIM,
            },
            {
                "label": "Continuation grant",
                "document_number": "US 10,831,913 B2",
                "claim_number": 1,
                "claim_text": CONTINUATION_CLAIM,
            },
        ]
    )

    assert result["summary"]["claim_count"] == 2
    assert any(
        "processor-specific public key" in item["text"].lower()
        for item in result["added"]
    )
    assert any(
        "decrypt the content" in item["text"].lower() for item in result["removed"]
    )
    assert result["summary"]["changed_limitations"] > 0
    assert all(claim["limitations"] for claim in result["claims"])


def test_compare_family_claims_requires_two_claims():
    try:
        compare_family_claims(
            [
                {
                    "label": "Only grant",
                    "document_number": "US 1 B2",
                    "claim_number": 1,
                    "claim_text": PARENT_CLAIM,
                }
            ]
        )
    except ValueError as exc:
        assert "at least two" in str(exc)
    else:
        raise AssertionError("one claim must not produce a family comparison")


def test_build_coverage_review_ranks_concepts_by_best_family_claim_match():
    claims = [
        {"label": "Parent grant", "document_number": "US 1 B2"},
        {"label": "Continuation grant", "document_number": "US 2 B2"},
    ]
    concepts = [
        {
            "title": "Migration between processors",
            "evidence": "Paragraph 40 describes migration for maintenance.",
        },
        {
            "title": "Processor-specific public keys",
            "evidence": "Paragraph 10 describes a key for each processor.",
        },
    ]
    support_result = {
        "profile": "balanced",
        "results": [
            {
                "query": "Migration between processors",
                "hits": [
                    {"paragraph_id": 0, "sentence": "first claim", "score": 0.22},
                    {"paragraph_id": 1, "sentence": "second claim", "score": 0.18},
                ],
            },
            {
                "query": "Processor-specific public keys",
                "hits": [
                    {
                        "paragraph_id": 3,
                        "sentence": "second claim limitation",
                        "score": 0.81,
                    },
                    {
                        "paragraph_id": 1,
                        "sentence": "first claim limitation",
                        "score": 0.53,
                    },
                ],
            },
        ],
    }

    result = build_coverage_review(
        claims,
        concepts,
        support_result,
        paragraph_claim_indexes=[0, 0, 1, 1],
    )

    assert result["concepts"][0]["title"] == "Migration between processors"
    assert result["concepts"][0]["relative_match"] == "Lowest family-claim similarity"
    assert result["concepts"][1]["best_match"]["document_number"] == "US 2 B2"
    assert result["concepts"][1]["best_score"] == 0.81
    assert result["profile"] == "balanced"
