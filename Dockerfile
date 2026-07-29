# syntax=docker/dockerfile:1.7

ARG UV_VERSION=0.11.21

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv
FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    HF_HOME=/opt/patentagility/huggingface \
    PATENTAGILITY_CACHE_DIR=/opt/patentagility \
    PYTHONUNBUFFERED=1

COPY --from=uv /uv /uvx /bin/

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        graphviz \
        libgomp1 \
        poppler-utils \
        tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN uv pip install \
        --system \
        --no-cache \
        --index-url https://download.pytorch.org/whl/cpu \
        torch \
    && uv pip install --system --no-cache -r requirements.txt \
    && python -m spacy download en_core_web_sm

RUN python - <<'PY'
from sentence_transformers import SentenceTransformer

SentenceTransformer(
    "mixedbread-ai/mxbai-embed-xsmall-v1",
    device="cpu",
    cache_folder="/opt/patentagility/huggingface/hub",
)
PY

COPY config.py gunicorn.conf.py service.py ./
COPY core ./core
COPY data ./data
COPY web ./web

RUN useradd --create-home --uid 10001 patentagility \
    && chown -R patentagility:patentagility /opt/patentagility

USER patentagility

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/ready', timeout=4)"

CMD ["gunicorn", "-c", "gunicorn.conf.py"]
