import os
from pathlib import Path


CACHE_ROOT = Path(
    os.environ.get(
        "PATENTAGILITY_CACHE_DIR",
        Path.home() / ".cache" / "patentagility",
    )
).expanduser()

HF_CACHE_DIR = Path(
    os.environ.get("PATENTAGILITY_HF_CACHE_DIR", CACHE_ROOT / "huggingface")
).expanduser()
SPACY_CACHE_DIR = Path(
    os.environ.get("PATENTAGILITY_SPACY_CACHE_DIR", CACHE_ROOT / "spacy")
).expanduser()
TESSERACT_CMD = Path(
    os.environ.get("PATENTAGILITY_TESSERACT_CMD", "tesseract")
).expanduser()
