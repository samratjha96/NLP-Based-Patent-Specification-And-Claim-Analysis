"""Production Gunicorn configuration for one inference server."""

from __future__ import annotations

import os


workers = int(os.environ.get("PATENTAGILITY_WEB_WORKERS", "1"))
threads = int(os.environ.get("PATENTAGILITY_WEB_THREADS", "64"))

if workers > 1 and os.environ.get("PATENTAGILITY_ALLOW_MULTI_MODEL_WORKERS") != "1":
    raise RuntimeError(
        "multiple workers create one model replica and queue per process; "
        "set PATENTAGILITY_ALLOW_MULTI_MODEL_WORKERS=1 after measuring memory"
    )

bind = (
    f"{os.environ.get('PATENTAGILITY_HOST', '127.0.0.1')}:"
    f"{os.environ.get('PATENTAGILITY_PORT', '8000')}"
)
wsgi_app = "service:create_app()"
worker_class = "core.gunicorn_worker.DrainingThreadWorker"
worker_connections = max(threads * 2, 128)
timeout = int(os.environ.get("PATENTAGILITY_HTTP_TIMEOUT_SECONDS", "300"))
graceful_timeout = int(os.environ.get("PATENTAGILITY_SHUTDOWN_TIMEOUT_SECONDS", "180"))
keepalive = int(os.environ.get("PATENTAGILITY_KEEPALIVE_SECONDS", "5"))
preload_app = False
accesslog = "-"
errorlog = "-"
capture_output = True
access_log_format = (
    '{"event":"http_request","remote":"%(h)s","method":"%(m)s",'
    '"path":"%(U)s","status":%(s)s,"response_bytes":%(B)s,'
    '"duration_microseconds":%(D)s,"process_id":"%(p)s"}'
)
