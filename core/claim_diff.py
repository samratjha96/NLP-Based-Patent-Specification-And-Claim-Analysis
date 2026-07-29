"""Deterministic token-level differences between claim versions."""

from __future__ import annotations

import re
from difflib import SequenceMatcher


_TOKEN_PATTERN = re.compile(
    r"\s+|\w+(?:['’]\w+)*|[^\w\s]+",
    re.UNICODE,
)


def diff_claim_text(before_text: str, after_text: str) -> dict[str, object]:
    """Return ordered equal, delete, and insert segments for two claim versions."""
    before_tokens = _tokenize(before_text)
    after_tokens = _tokenize(after_text)
    matcher = SequenceMatcher(
        None,
        before_tokens,
        after_tokens,
        autojunk=False,
    )

    segments: list[dict[str, str]] = []
    unchanged_tokens = 0
    inserted_tokens = 0
    deleted_tokens = 0
    change_blocks = 0

    for (
        operation,
        before_start,
        before_end,
        after_start,
        after_end,
    ) in matcher.get_opcodes():
        if operation == "equal":
            tokens = before_tokens[before_start:before_end]
            _append_segment(segments, "equal", tokens)
            unchanged_tokens += _count_tokens(tokens)
            continue

        change_blocks += 1
        if operation in {"delete", "replace"}:
            tokens = before_tokens[before_start:before_end]
            _append_segment(segments, "delete", tokens)
            deleted_tokens += _count_tokens(tokens)
        if operation in {"insert", "replace"}:
            tokens = after_tokens[after_start:after_end]
            _append_segment(segments, "insert", tokens)
            inserted_tokens += _count_tokens(tokens)

    return {
        "segments": segments,
        "summary": {
            "before_tokens": _count_tokens(before_tokens),
            "after_tokens": _count_tokens(after_tokens),
            "unchanged_tokens": unchanged_tokens,
            "inserted_tokens": inserted_tokens,
            "deleted_tokens": deleted_tokens,
            "change_blocks": change_blocks,
        },
    }


def _tokenize(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    return _TOKEN_PATTERN.findall(normalized)


def _count_tokens(tokens: list[str]) -> int:
    return sum(not token.isspace() for token in tokens)


def _append_segment(
    segments: list[dict[str, str]],
    operation: str,
    tokens: list[str],
) -> None:
    if not tokens:
        return
    text = "".join(tokens)
    if segments and segments[-1]["operation"] == operation:
        segments[-1]["text"] += text
        return
    segments.append({"operation": operation, "text": text})
