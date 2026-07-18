"""Bounded micro-batching for blocking local inference workloads."""

from __future__ import annotations

import queue
import threading
import time
from collections.abc import Callable, Sequence
from typing import Generic, TypeVar, cast


InputT = TypeVar("InputT")
ResultT = TypeVar("ResultT")


class QueueAtCapacity(RuntimeError):
    """Raised when admission would exceed the configured pending-work limit."""


class WorkTimeout(TimeoutError):
    """Raised when a caller's deadline expires before a result is available."""


class ProcessorClosed(RuntimeError):
    """Raised when new work is submitted after shutdown starts."""


class WorkFuture(Generic[ResultT]):
    def __init__(self) -> None:
        self._event = threading.Event()
        self._lock = threading.Lock()
        self._result: ResultT | None = None
        self._error: BaseException | None = None
        self._cancelled = False

    @property
    def cancelled(self) -> bool:
        with self._lock:
            return self._cancelled

    def cancel(self) -> bool:
        with self._lock:
            if self._event.is_set():
                return False
            self._cancelled = True
            self._event.set()
            return True

    def set_result(self, result: ResultT) -> None:
        with self._lock:
            if self._event.is_set():
                return
            self._result = result
            self._event.set()

    def set_error(self, error: BaseException) -> None:
        with self._lock:
            if self._event.is_set():
                return
            self._error = error
            self._event.set()

    def result(self, timeout: float | None = None) -> ResultT:
        if not self._event.wait(timeout):
            if self.cancel():
                raise WorkTimeout("inference deadline exceeded")
            return self.result(timeout=0)
        with self._lock:
            if self._cancelled:
                raise ProcessorClosed("work was cancelled")
            if self._error is not None:
                raise self._error
            return cast(ResultT, self._result)


class _WorkItem(Generic[InputT, ResultT]):
    def __init__(self, value: InputT) -> None:
        self.value = value
        self.enqueued_at = time.perf_counter()
        self.future: WorkFuture[ResultT] = WorkFuture()


_STOP = object()


class BatchProcessor(Generic[InputT, ResultT]):
    """Run a blocking batch handler behind bounded admission control."""

    def __init__(
        self,
        handler: Callable[[Sequence[InputT]], Sequence[ResultT]],
        *,
        capacity: int,
        max_batch_size: int,
        batch_window_seconds: float,
        item_cost: Callable[[InputT], int] | None = None,
        max_batch_cost: int | None = None,
        auto_start: bool = True,
        name: str = "patentagility-inference",
    ) -> None:
        if capacity < 1:
            raise ValueError("capacity must be positive")
        if max_batch_size < 1:
            raise ValueError("max_batch_size must be positive")
        if batch_window_seconds < 0:
            raise ValueError("batch_window_seconds cannot be negative")
        if (item_cost is None) != (max_batch_cost is None):
            raise ValueError("item_cost and max_batch_cost must be configured together")
        if max_batch_cost is not None and max_batch_cost < 1:
            raise ValueError("max_batch_cost must be positive")

        self._handler = handler
        self._queue: queue.Queue[_WorkItem[InputT, ResultT] | object] = queue.Queue(
            maxsize=capacity
        )
        self._capacity = capacity
        self._pending_slots = threading.BoundedSemaphore(capacity)
        self._max_batch_size = max_batch_size
        self._batch_window_seconds = batch_window_seconds
        self._item_cost = item_cost
        self._max_batch_cost = max_batch_cost
        self._carryover_depth = 0
        self._accepting = True
        self._started = False
        self._state_lock = threading.Lock()
        self._metrics_lock = threading.Lock()
        self._thread = threading.Thread(target=self._run, name=name, daemon=True)
        self._metrics: dict[str, float | int] = {
            "accepted": 0,
            "rejected": 0,
            "completed": 0,
            "failed": 0,
            "timed_out": 0,
            "cancelled": 0,
            "batches": 0,
            "batch_items": 0,
            "batch_cost": 0,
            "inflight": 0,
            "processing_seconds": 0.0,
            "queue_wait_seconds": 0.0,
        }
        if auto_start:
            self.start()

    @property
    def accepting(self) -> bool:
        with self._state_lock:
            return self._accepting

    @property
    def is_alive(self) -> bool:
        return self._thread.is_alive()

    def start(self) -> None:
        with self._state_lock:
            if self._started:
                return
            if not self._accepting:
                raise ProcessorClosed("processor is closed")
            self._started = True
            self._thread.start()

    def enqueue(self, value: InputT) -> WorkFuture[ResultT]:
        with self._state_lock:
            if not self._accepting:
                raise ProcessorClosed("processor is closed")
            item: _WorkItem[InputT, ResultT] = _WorkItem(value)
            if not self._pending_slots.acquire(blocking=False):
                self._increment("rejected")
                raise QueueAtCapacity("inference queue is full")
            try:
                self._queue.put_nowait(item)
            except queue.Full as exc:
                self._pending_slots.release()
                self._increment("rejected")
                raise QueueAtCapacity("inference queue is full") from exc
            self._increment("accepted")
            return item.future

    def submit(self, value: InputT, *, timeout: float | None) -> ResultT:
        try:
            return self.enqueue(value).result(timeout=timeout)
        except WorkTimeout:
            self._increment("timed_out")
            raise

    def close(self, *, drain: bool = True, timeout: float | None = None) -> None:
        with self._state_lock:
            if not self._accepting:
                return
            self._accepting = False
            started = self._started

        if not drain:
            self._cancel_pending()

        if not started:
            self._cancel_pending()
            return

        self._queue.put(_STOP)
        self._thread.join(timeout)
        if self._thread.is_alive():
            raise TimeoutError("inference worker did not stop before the deadline")

    def snapshot(self) -> dict[str, float | int | bool]:
        accepting = self.accepting
        worker_alive = self.is_alive
        with self._metrics_lock:
            snapshot: dict[str, float | int | bool] = dict(self._metrics)
        batches = int(snapshot["batches"])
        batch_items = int(snapshot["batch_items"])
        snapshot.update(
            {
                "average_batch_size": batch_items / batches if batches else 0.0,
                "average_batch_cost": (
                    int(snapshot["batch_cost"]) / batches if batches else 0.0
                ),
                "average_queue_wait_seconds": (
                    float(snapshot["queue_wait_seconds"]) / batch_items
                    if batch_items
                    else 0.0
                ),
                "queue_depth": self._queue.qsize() + self._carryover_depth,
                "queue_capacity": self._capacity,
                "accepting": accepting,
                "worker_alive": worker_alive,
            }
        )
        return snapshot

    def _run(self) -> None:
        carryover: _WorkItem[InputT, ResultT] | None = None
        while True:
            if carryover is None:
                first = self._queue.get()
            else:
                first = carryover
                carryover = None
                self._carryover_depth = 0
            if first is _STOP:
                self._queue.task_done()
                return

            batch = [first]
            batch_cost = self._cost(first.value)
            deadline = time.monotonic() + self._batch_window_seconds
            while len(batch) < self._max_batch_size:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    break
                try:
                    next_item = self._queue.get(timeout=remaining)
                except queue.Empty:
                    break
                if next_item is _STOP:
                    self._queue.task_done()
                    self._queue.put(_STOP)
                    break
                next_cost = self._cost(next_item.value)
                if (
                    self._max_batch_cost is not None
                    and batch_cost + next_cost > self._max_batch_cost
                ):
                    carryover = next_item
                    self._carryover_depth = 1
                    break
                batch.append(next_item)
                batch_cost += next_cost

            self._process(batch, batch_cost)

    def _process(self, batch: list[object], batch_cost: int) -> None:
        items = [item for item in batch if isinstance(item, _WorkItem)]
        for _item in items:
            self._pending_slots.release()
        active = [item for item in items if not item.future.cancelled]
        cancelled = len(items) - len(active)
        if cancelled:
            self._increment("cancelled", cancelled)

        if active:
            self._increment(
                "queue_wait_seconds",
                sum(time.perf_counter() - item.enqueued_at for item in active),
            )
            self._increment("batches")
            self._increment("batch_items", len(active))
            self._increment("batch_cost", batch_cost)
            self._set_inflight(len(active))
            started = time.perf_counter()
            try:
                results = list(self._handler([item.value for item in active]))
                if len(results) != len(active):
                    raise ValueError("batch handler returned the wrong result count")
            except Exception as exc:
                error = RuntimeError("batch handler failed")
                error.__cause__ = exc
                for item in active:
                    item.future.set_error(error)
                self._increment("failed", len(active))
            else:
                for item, result in zip(active, results):
                    item.future.set_result(result)
                self._increment("completed", len(active))
            finally:
                self._increment("processing_seconds", time.perf_counter() - started)
                self._set_inflight(0)

        for _item in items:
            self._queue.task_done()

    def _cancel_pending(self) -> None:
        while True:
            try:
                item = self._queue.get_nowait()
            except queue.Empty:
                return
            if isinstance(item, _WorkItem):
                self._pending_slots.release()
                if item.future.cancel():
                    self._increment("cancelled")
            self._queue.task_done()

    def _cost(self, value: InputT) -> int:
        return self._item_cost(value) if self._item_cost is not None else 1

    def _increment(self, key: str, amount: float | int = 1) -> None:
        with self._metrics_lock:
            self._metrics[key] += amount

    def _set_inflight(self, value: int) -> None:
        with self._metrics_lock:
            self._metrics["inflight"] = value
