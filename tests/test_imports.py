import os
import subprocess
import sys

import pytest


def test_core_modules_import_without_loading_models(tmp_path):
    env = os.environ.copy()
    env["PATENTAGILITY_CACHE_DIR"] = str(tmp_path / "cache")

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import core.antecedent_basis; "
                "import core.claim_segmentation; "
                "import core.support_search; "
                "import core.ocr; "
                "import core.uspto_file_retrieval"
            ),
        ],
        capture_output=True,
        check=False,
        env=env,
        text=True,
    )

    assert result.returncode == 0, result.stderr


def test_antecedent_analysis_flags_unintroduced_noun_phrase(monkeypatch):
    model = pytest.importorskip("en_core_web_sm")

    from core import antecedent_basis

    monkeypatch.setattr(antecedent_basis, "_nlp", model.load())
    result = antecedent_basis.analyze_intro_ref(
        "A system comprising a processor and the memory coupled to the processor."
    )

    assert [mention.text for mention in result["used_without_intro"]] == [
        "the memory"
    ]


def test_antecedent_analysis_accepts_bare_mass_noun_and_claim_transition(monkeypatch):
    model = pytest.importorskip("en_core_web_sm")

    from core import antecedent_basis

    monkeypatch.setattr(antecedent_basis, "_nlp", model.load())
    result = antecedent_basis.analyze_intro_ref(
        "A method for storing content, the method comprising: receiving encrypted "
        "content; and storing the encrypted content."
    )

    assert result["used_without_intro"] == []


def test_claim_segmentation_separates_preamble_from_first_limitation():
    from core.claim_segmentation import semicolon_first_segments

    segments = semicolon_first_segments(
        "A method comprising: providing a key; receiving encrypted content; and "
        "storing the encrypted content."
    )

    assert [segment["kind"] for segment in segments] == [
        "preamble",
        "limitation",
        "limitation",
        "limitation",
    ]
    assert segments[1]["text"] == "providing a key"


def test_claim_frame_prefers_leading_limitation_action():
    model = pytest.importorskip("en_core_web_sm")

    from core.claim_segmentation import build_action_frame

    nlp = model.load()
    providing = build_action_frame(
        "providing a set of identifiers, wherein each identifier identifies a processor",
        nlp=nlp,
    )
    receiving = build_action_frame(
        "receiving encrypted content, the encrypted content being encrypted using a key",
        nlp=nlp,
    )

    assert providing["anchor_verb"] == "provide"
    assert receiving["anchor_verb"] == "receive"
