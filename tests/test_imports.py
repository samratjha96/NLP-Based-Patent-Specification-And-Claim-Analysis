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
