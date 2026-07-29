"""Gunicorn worker that drains the inference queue on SIGTERM."""

from __future__ import annotations

from collections.abc import Callable
from types import FrameType

from gunicorn.workers.gthread import ThreadWorker


class DrainingThreadWorker(ThreadWorker):
    """Stop inference admission before Gunicorn drains HTTP connections."""

    def handle_exit(self, sig: int, frame: FrameType | None) -> None:
        self._call_app_hook("patentagility_begin_drain")
        super().handle_exit(sig, frame)

    def run(self) -> None:
        try:
            super().run()
        finally:
            self._call_app_hook("patentagility_shutdown")

    def _call_app_hook(self, name: str) -> None:
        app = getattr(self, "wsgi", None)
        extensions = getattr(app, "extensions", {})
        hook: Callable[[], None] | None = extensions.get(name)
        if hook is None:
            return
        try:
            hook()
        except Exception:
            self.log.exception("PatentAgility lifecycle hook failed: %s", name)
