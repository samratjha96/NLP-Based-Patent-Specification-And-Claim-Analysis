from __future__ import annotations

import re
import tempfile
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from core.ocr import specification_to_text
from core.uspto_file_retrieval import (
    download_file,
    get_pdf_download_url,
    list_documents,
    pick_spec_doc,
    search_application_record,
)


class PatentDataNotConfigured(RuntimeError):
    pass


class PatentDataUnavailable(RuntimeError):
    pass


def _digits(value: Any) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def _find(obj: Any, keys: tuple[str, ...]) -> Any:
    if isinstance(obj, dict):
        for key in keys:
            if obj.get(key) not in (None, "", []):
                return obj[key]
        for value in obj.values():
            found = _find(value, keys)
            if found not in (None, "", []):
                return found
    elif isinstance(obj, list):
        for value in obj:
            found = _find(value, keys)
            if found not in (None, "", []):
                return found
    return None


def parse_application_metadata(payload: dict[str, Any]) -> dict[str, str]:
    application_number = _digits(
        _find(
            payload,
            ("applicationNumberText", "applicationNumber", "application_number"),
        )
    )
    patent_number = _digits(
        _find(payload, ("patentNumber", "patentNumberText", "patent_number"))
    )
    return {
        "application_number": application_number,
        "patent_number": patent_number,
        "title": str(
            _find(payload, ("inventionTitle", "inventionTitleText", "title")) or ""
        ).strip(),
        "status": str(
            _find(
                payload,
                (
                    "applicationStatusDescriptionText",
                    "applicationStatusDescription",
                    "applicationStatus",
                    "status",
                ),
            )
            or ""
        ).strip(),
        "filing_date": str(
            _find(payload, ("filingDate", "filingDateText", "filing_date")) or ""
        ).strip(),
    }


def extract_claims_text(specification_text: str) -> str:
    if not specification_text:
        return ""
    marker = re.search(
        r"(?is)(?:what\s+is\s+claimed\s+is|claims)\s*:?\s*(?=1\s*[.)])",
        specification_text,
    )
    if marker:
        return specification_text[marker.end() :].strip()
    numbered = re.search(r"(?m)^\s*1\s*[.)]\s+", specification_text)
    return specification_text[numbered.start() :].strip() if numbered else ""


class UsptoPatentLoader:
    def __init__(
        self,
        *,
        api_key: str | None,
        cache_dir: str | Path | None = None,
        cache_size: int = 24,
    ):
        self.api_key = api_key
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.cache_size = cache_size
        self._cache: OrderedDict[tuple[str, str], dict[str, Any]] = OrderedDict()
        self._records: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def load(self, *, identifier: str, identifier_type: str) -> dict[str, Any]:
        if not self.api_key:
            raise PatentDataNotConfigured(
                "Official patent lookup requires a USPTO Open Data Portal API key."
            )

        normalized = _digits(identifier)
        cache_key = (identifier_type, normalized)
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._cache.move_to_end(cache_key)
                return dict(cached)

        try:
            record = search_application_record(
                patent_number=normalized if identifier_type == "patent" else None,
                application_number=normalized
                if identifier_type == "application"
                else None,
                API_KEY=self.api_key,
            )
            metadata = parse_application_metadata(record)
            application_number = metadata["application_number"]
            if not application_number and identifier_type == "application":
                application_number = normalized
                metadata["application_number"] = normalized
            if not application_number:
                raise RuntimeError("USPTO did not return an application number.")

            documents = list_documents(application_number, API_KEY=self.api_key)
            specification = pick_spec_doc(documents, which="earliest")
            specification_text = self._load_specification(
                application_number,
                specification,
            )
        except (requests.RequestException, OSError, RuntimeError, ValueError) as exc:
            raise PatentDataUnavailable("USPTO record could not be loaded.") from exc

        result: dict[str, Any] = {
            "source": "USPTO Open Data Portal",
            "record_id": f"application:{application_number}",
            **metadata,
            "specification_text": specification_text,
            "claims_text": extract_claims_text(specification_text),
            "document_count": len(documents),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._cache[cache_key] = result
            self._records[result["record_id"]] = result
            self._cache.move_to_end(cache_key)
            while len(self._cache) > self.cache_size:
                _evicted_key, evicted = self._cache.popitem(last=False)
                evicted_id = evicted["record_id"]
                if not any(
                    cached["record_id"] == evicted_id for cached in self._cache.values()
                ):
                    self._records.pop(evicted_id, None)
        return dict(result)

    def get_text(self, record_id: str, section: str) -> str:
        field = {
            "specification": "specification_text",
            "claims": "claims_text",
        }.get(section)
        if field is None:
            raise ValueError("unknown patent record section")
        with self._lock:
            record = self._records.get(record_id)
            value = record.get(field) if record else None
        if not value:
            raise ValueError("loaded patent record is unavailable")
        return str(value)

    def _load_specification(
        self,
        application_number: str,
        specification: dict[str, Any],
    ) -> str:
        url = get_pdf_download_url(specification)
        identifier = _digits(specification.get("documentIdentifier")) or "specification"

        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            path = self.cache_dir / f"{application_number}_{identifier}.pdf"
            download_file(url, path, api_key=self.api_key)
            return self._extract_text(path)

        with tempfile.TemporaryDirectory(prefix="patentagility-uspto-") as directory:
            path = Path(directory) / f"{application_number}_{identifier}.pdf"
            download_file(url, path, api_key=self.api_key)
            return self._extract_text(path)

    @staticmethod
    def _extract_text(path: Path) -> str:
        text = specification_to_text(path)
        if not text:
            raise RuntimeError("USPTO specification contained no extractable text.")
        return text
