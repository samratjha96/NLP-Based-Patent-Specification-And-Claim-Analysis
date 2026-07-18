import threading

import pytest

from core.batch_queue import (
    BatchProcessor,
    ProcessorClosed,
    QueueAtCapacity,
    WorkTimeout,
)


def test_processor_batches_work_and_returns_results():
    received = []

    def handle(items):
        received.append(items)
        return [item * 2 for item in items]

    processor = BatchProcessor(
        handle,
        capacity=4,
        max_batch_size=4,
        batch_window_seconds=0.1,
        auto_start=False,
    )
    processor.start()
    first = processor.enqueue(2)
    second = processor.enqueue(3)

    assert first.result(timeout=1) == 4
    assert second.result(timeout=1) == 6
    assert received == [[2, 3]]
    assert processor.snapshot()["completed"] == 2
    processor.close()


def test_processor_rejects_work_when_pending_queue_is_full():
    processor = BatchProcessor(
        lambda items: items,
        capacity=1,
        max_batch_size=1,
        batch_window_seconds=0,
        auto_start=False,
    )

    processor.enqueue("accepted")
    with pytest.raises(QueueAtCapacity):
        processor.enqueue("rejected")

    assert processor.snapshot()["rejected"] == 1
    processor.close(drain=False)


def test_timed_out_work_is_cancelled_before_processing():
    handled = threading.Event()
    processor = BatchProcessor(
        lambda items: handled.set() or items,
        capacity=1,
        max_batch_size=1,
        batch_window_seconds=0,
        auto_start=False,
    )
    future = processor.enqueue("too late")

    with pytest.raises(WorkTimeout):
        future.result(timeout=0.01)

    processor.start()
    processor.close()
    assert not handled.is_set()
    assert processor.snapshot()["cancelled"] == 1


def test_processor_propagates_batch_failures_and_rejects_after_close():
    def fail(_items):
        raise ValueError("bad batch")

    processor = BatchProcessor(
        fail,
        capacity=1,
        max_batch_size=1,
        batch_window_seconds=0,
    )
    future = processor.enqueue("item")

    with pytest.raises(RuntimeError, match="batch handler failed"):
        future.result(timeout=1)

    processor.close()
    with pytest.raises(ProcessorClosed):
        processor.enqueue("after close")


def test_processor_splits_batches_at_the_configured_work_budget():
    received = []

    def handle(items):
        received.append(items)
        return items

    processor = BatchProcessor(
        handle,
        capacity=2,
        max_batch_size=2,
        batch_window_seconds=0.1,
        item_cost=len,
        max_batch_cost=4,
        auto_start=False,
    )
    first = processor.enqueue("aaa")
    second = processor.enqueue("bbb")
    processor.start()

    assert first.result(timeout=1) == "aaa"
    assert second.result(timeout=1) == "bbb"
    assert received == [["aaa"], ["bbb"]]
    processor.close()
