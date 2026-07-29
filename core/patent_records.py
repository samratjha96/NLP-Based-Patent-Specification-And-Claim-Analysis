from __future__ import annotations

import re
import tempfile
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup

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


GOOGLE_PATENT_PAGE_URL = "https://patents.google.com/patent/US{identifier}/en"
GOOGLE_PATENT_SEARCH_URL = "https://patents.google.com/xhr/query"
GOOGLE_PATENT_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/json",
    "User-Agent": "PatentAgility/1.0 (+https://github.com/kasigmon/"
    "NLP-Based-Patent-Specification-And-Claim-Analysis)",
}
CLAIMS_SECTION_PATTERN = re.compile(
    r"(?is)(?:what\s+is\s+claimed\s+(?:is|1s)|claims)\s*:?\s*"
    r"(?=1\s*[.)])"
)


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


def split_specification_and_claims(document_text: str) -> tuple[str, str]:
    if not document_text:
        return "", ""
    marker = CLAIMS_SECTION_PATTERN.search(document_text)
    if marker:
        return document_text[: marker.start()].strip(), document_text[marker.end() :].strip()
    numbered = re.search(r"(?m)^\s*1\s*[.)]\s+", document_text)
    if numbered:
        return document_text[: numbered.start()].strip(), document_text[numbered.start() :].strip()
    return document_text.strip(), ""


def extract_claims_text(specification_text: str) -> str:
    return split_specification_and_claims(specification_text)[1]


def parse_claims(claims_text: str) -> list[dict[str, Any]]:
    text = claims_text.replace("<<<PAGE_BREAK>>>", "\n\n")
    boundaries = list(re.finditer(r"(?m)^\s*(\d{1,3})\.\s+", text))
    claims = []
    for index, boundary in enumerate(boundaries):
        number = int(boundary.group(1))
        end = boundaries[index + 1].start() if index + 1 < len(boundaries) else len(text)
        claim_text = text[boundary.start() : end]
        claim_text = re.sub(
            r"(?mi)^\s*US\s+[\d,]+\s+[A-Z]\d\s*(?:\d+)?\s*$",
            "",
            claim_text,
        )
        claim_text = re.sub(
            r"(?m)^\s*(?:5|10|15|20|25|30|35|40|45|50|55|60|65)\s*$",
            "",
            claim_text,
        )
        claim_text = re.sub(r"\s+", " ", claim_text).strip()
        if not claim_text:
            continue

        dependencies: set[int] = set()
        for match in re.finditer(
            r"\bclaims?\s+(\d+)(?:\s*(?:-|–|to|through)\s*(\d+))?",
            claim_text,
            flags=re.IGNORECASE,
        ):
            start = int(match.group(1))
            stop = int(match.group(2) or start)
            dependencies.update(range(min(start, stop), max(start, stop) + 1))

        claims.append(
            {
                "number": number,
                "text": claim_text,
                "dependencies": sorted(dependencies),
                "independent": not dependencies,
            }
        )
    return claims


def _parse_date(value: str) -> str:
    cleaned = re.sub(r"\s+", " ", value).strip()
    for pattern in ("%b. %d, %Y", "%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(cleaned, pattern).date().isoformat()
        except ValueError:
            continue
    return cleaned


def parse_grant_metadata(grant_text: str) -> dict[str, Any]:
    def match(pattern: str) -> str:
        found = re.search(pattern, grant_text, flags=re.IGNORECASE)
        return found.group(1).strip() if found else ""

    patent_number = _digits(
        match(r"\bUS\s+([\d,]{6,12})\s+[A-Z]\d\b")
        or match(r"Patent\s+No\.\s*:\s*(?:US\s*)?([\d,]+)")
    )
    issue_date = _parse_date(
        match(
            r"\bUS\s+[\d,]{6,12}\s+[A-Z]\d\s+"
            r"([A-Z][a-z]{2}\.?\s+\d{1,2},\s+\d{4})"
        )
        or match(r"Date\s+of\s+Patent\s*:\s*([A-Z][a-z]+\S*\s+\d{1,2},\s+\d{4})")
    )
    application_number = _digits(
        match(r"Appl\.\s+No\.\s*:\s*([0-9/,]+)")
    )
    filing_date = _parse_date(
        match(r"\(\s*22\s*\)\s*Filed\s*:\s*([A-Z][a-z]+\S*\s+\d{1,2},\s+\d{4})")
    )
    title = re.sub(
        r"\s+",
        " ",
        match(r"\(\s*54\s*\)\s*(.+?)(?=\n\n|\(\s*71\s*\))"),
    ).strip()
    claim_count_text = match(r"\b(\d+)\s+Claims?\b")

    return {
        "application_number": application_number,
        "patent_number": patent_number,
        "title": title.title() if title.isupper() else title,
        "status": f"Granted · {issue_date}" if issue_date else "Granted",
        "filing_date": filing_date,
        "grant_date": issue_date,
        "claim_count": int(claim_count_text) if claim_count_text else None,
    }


def parse_google_patent_page(document: str) -> dict[str, Any]:
    soup = BeautifulSoup(document, "html.parser")
    article = soup.select_one("article.result")
    if article is None:
        raise ValueError("Public patent page did not contain a patent record.")

    def value(selector: str, attribute: str | None = None) -> str:
        node = article.select_one(selector)
        if node is None:
            return ""
        if attribute:
            return str(node.get(attribute) or "").strip()
        return re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()

    application_number = _digits(value('[itemprop="applicationNumber"]'))
    publication_number = value('[itemprop="publicationNumber"]')
    patent_number = _digits(value('meta[itemprop="numberWithoutCodes"]', "content"))
    kind_code = value('meta[itemprop="kindCode"]', "content")
    filing_date = value('[itemprop="filingDate"]', "datetime") or value(
        '[itemprop="filingDate"]'
    )
    publication_date = value('[itemprop="publicationDate"]', "datetime") or value(
        '[itemprop="publicationDate"]'
    )
    title = value('[itemprop="title"]')
    abstract = value('section[itemprop="abstract"] [itemprop="content"]')
    pdf_url = value('[itemprop="pdfLink"]', "href")

    paragraphs = []
    for paragraph in article.select(
        'section[itemprop="description"] .description-paragraph'
    ):
        text = re.sub(r"\s+", " ", paragraph.get_text(" ", strip=True)).strip()
        if not text:
            continue
        number = _digits(paragraph.get("num"))
        paragraphs.append(f"[{number.zfill(4)}] {text}" if number else text)

    claim_texts = []
    for claim in article.select('section[itemprop="claims"] div.claim[id^="CLM-"]'):
        text = re.sub(r"\s+", " ", claim.get_text(" ", strip=True)).strip()
        if text:
            claim_texts.append(text)

    if not patent_number or not application_number:
        raise ValueError("Public patent page did not contain record identifiers.")
    if not paragraphs:
        raise ValueError("Public patent page did not contain a description.")
    if not claim_texts:
        raise ValueError("Public patent page did not contain claims.")

    specification_parts = []
    if abstract:
        specification_parts.append(f"Abstract\n\n{abstract}")
    specification_parts.append("Detailed description\n\n" + "\n\n".join(paragraphs))
    claims_text = "\n\n".join(claim_texts)
    claims = parse_claims(claims_text)
    if len(claims) != len(claim_texts):
        raise ValueError("Public patent claims could not be parsed in sequence.")

    status = "Granted" if kind_code.startswith("B") else "Published"
    if publication_date:
        status = f"{status} · {publication_date}"

    return {
        "application_number": application_number,
        "patent_number": patent_number,
        "publication_number": publication_number,
        "title": title,
        "abstract": abstract,
        "status": status,
        "filing_date": filing_date,
        "grant_date": publication_date if kind_code.startswith("B") else "",
        "specification_text": "\n\n".join(specification_parts),
        "claims_text": claims_text,
        "claims": claims,
        "pdf_url": pdf_url,
        "inventors": [
            re.sub(r"\s+", " ", node.get_text(" ", strip=True)).strip()
            for node in article.select('[itemprop="inventor"]')
            if node.get_text(" ", strip=True)
        ],
        "assignee": value('[itemprop="assigneeCurrent"]'),
    }


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
        normalized = _digits(identifier)
        cache_key = (identifier_type, normalized)
        with self._lock:
            cached = self._cache.get(cache_key)
            if cached is not None:
                self._cache.move_to_end(cache_key)
                return dict(cached)

        if not self.api_key:
            result = self._load_public_record(normalized, identifier_type)
            self._remember(cache_key, result)
            return dict(result)

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

        claims_text = extract_claims_text(specification_text)
        parsed_claims = parse_claims(claims_text)
        principal_claim = next(
            (claim for claim in parsed_claims if claim["independent"]),
            parsed_claims[0] if parsed_claims else None,
        )
        result: dict[str, Any] = {
            "source": "USPTO Open Data Portal",
            "record_id": f"application:{application_number}",
            **metadata,
            "specification_text": specification_text,
            "claims_text": claims_text,
            "principal_claim_text": principal_claim["text"] if principal_claim else "",
            "claim_count": len(parsed_claims),
            "independent_claim_numbers": [
                claim["number"] for claim in parsed_claims if claim["independent"]
            ],
            "document_count": len(documents),
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        self._remember(cache_key, result)
        return dict(result)

    def _load_public_record(
        self,
        identifier: str,
        identifier_type: str,
    ) -> dict[str, Any]:
        try:
            if identifier_type == "patent":
                page_url = GOOGLE_PATENT_PAGE_URL.format(identifier=identifier)
                record = self._fetch_public_page(page_url)
            else:
                record, page_url = self._find_public_application(identifier)
        except (requests.RequestException, RuntimeError, ValueError) as exc:
            raise PatentDataUnavailable(
                "The public patent record could not be loaded."
            ) from exc

        if identifier_type == "patent" and record["patent_number"] != identifier:
            raise PatentDataUnavailable(
                "The public patent record did not match the requested patent."
            )
        if (
            identifier_type == "application"
            and record["application_number"] != identifier
        ):
            raise PatentDataUnavailable(
                "The public patent record did not match the requested application."
            )
        claims = record.pop("claims")
        principal_claim = next(
            (claim for claim in claims if claim["independent"]),
            claims[0],
        )
        return {
            "source": "Google Patents public record",
            "source_url": page_url,
            "record_id": f"grant:{record['patent_number']}",
            **record,
            "principal_claim_text": principal_claim["text"],
            "claim_count": len(claims),
            "independent_claim_numbers": [
                claim["number"] for claim in claims if claim["independent"]
            ],
            "document_count": 1,
            "extraction_method": "structured public patent text",
            "extraction_validation": "complete sequential claim set",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _fetch_public_page(page_url: str) -> dict[str, Any]:
        response = requests.get(
            page_url,
            headers=GOOGLE_PATENT_HEADERS,
            timeout=30,
        )
        response.raise_for_status()
        return parse_google_patent_page(response.text)

    def _find_public_application(
        self,
        application_number: str,
    ) -> tuple[dict[str, Any], str]:
        response = requests.get(
            GOOGLE_PATENT_SEARCH_URL,
            params={"url": f"q=(US{application_number})"},
            headers=GOOGLE_PATENT_HEADERS,
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        clusters = payload.get("results", {}).get("cluster", [])
        candidates = [
            result.get("id")
            for cluster in clusters
            for result in cluster.get("result", [])
            if result.get("id", "").startswith("patent/US")
        ]
        for candidate in candidates[:10]:
            page_url = f"https://patents.google.com/{candidate}"
            record = self._fetch_public_page(page_url)
            if record["application_number"] == application_number:
                return record, page_url
        raise RuntimeError("No matching public patent application was found.")

    def _remember(
        self,
        cache_key: tuple[str, str],
        result: dict[str, Any],
    ) -> None:
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

    def get_text(self, record_id: str, section: str) -> str:
        field = {
            "specification": "specification_text",
            "claims": "claims_text",
            "principal_claim": "principal_claim_text",
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
