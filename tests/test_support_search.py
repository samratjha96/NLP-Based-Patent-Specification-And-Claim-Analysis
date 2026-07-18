import os
from pathlib import Path
import subprocess
import sys

import pytest

from core import support_search


def test_hugging_face_cache_is_configured_before_library_import(tmp_path):
    cache_root = tmp_path / "cache"
    env = os.environ.copy()
    env.pop("HF_HOME", None)
    env.pop("HF_HUB_CACHE", None)
    env.pop("TRANSFORMERS_CACHE", None)
    env["PATENTAGILITY_CACHE_DIR"] = str(cache_root)

    result = subprocess.run(
        [
            sys.executable,
            "-c",
            (
                "import core.support_search; "
                "from huggingface_hub.constants import HF_HUB_CACHE; "
                "print(HF_HUB_CACHE)"
            ),
        ],
        capture_output=True,
        check=False,
        env=env,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert Path(result.stdout.strip()) == cache_root / "huggingface"


@pytest.mark.parametrize(
    ("cuda_available", "mps_available", "expected"),
    [
        (True, True, "cuda"),
        (False, True, "mps"),
        (False, False, "cpu"),
    ],
)
def test_default_device_prefers_available_accelerators(
    monkeypatch,
    cuda_available,
    mps_available,
    expected,
):
    monkeypatch.setattr(
        support_search.torch.cuda,
        "is_available",
        lambda: cuda_available,
    )
    monkeypatch.setattr(
        support_search.torch.backends.mps,
        "is_available",
        lambda: mps_available,
    )

    assert support_search.default_device() == expected
