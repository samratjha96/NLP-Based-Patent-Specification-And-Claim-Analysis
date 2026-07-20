from pathlib import Path

import pytest

from core.patent_records import (
    PatentDataNotConfigured,
    UsptoPatentLoader,
    extract_claims_text,
    parse_application_metadata,
)


def test_parse_application_metadata_handles_nested_odp_fields():
    payload = {
        "patentFileWrapperDataBag": [
            {
                "applicationMetaData": {
                    "applicationNumberText": "18/456,219",
                    "patentNumber": "12,345,678",
                    "inventionTitle": "A useful system",
                    "applicationStatusDescriptionText": "Patented Case",
                    "filingDate": "2024-01-02",
                }
            }
        ]
    }

    assert parse_application_metadata(payload) == {
        "application_number": "18456219",
        "patent_number": "12345678",
        "title": "A useful system",
        "status": "Patented Case",
        "filing_date": "2024-01-02",
    }


def test_extract_claims_text_returns_numbered_claim_section():
    text = """BACKGROUND\nA useful system.\n\nWhat is claimed is:\n1. A system comprising a processor.\n2. The system of claim 1, further comprising memory."""

    claims = extract_claims_text(text)

    assert claims.startswith("1. A system")
    assert "2. The system of claim 1" in claims
    assert "BACKGROUND" not in claims


def test_loader_requires_official_data_credentials():
    loader = UsptoPatentLoader(api_key=None)

    with pytest.raises(PatentDataNotConfigured):
        loader.load(identifier="12345678", identifier_type="patent")


def test_loader_downloads_extracts_and_caches_one_official_record(
    monkeypatch, tmp_path
):
    calls = {"search": 0, "documents": 0, "download": 0}
    metadata = {
        "applicationMetaData": {
            "applicationNumberText": "18/456,219",
            "patentNumber": "12,345,678",
            "inventionTitle": "A useful system",
        }
    }
    document = {
        "documentCode": "SPEC",
        "documentIdentifier": "spec-1",
        "officialDate": "2024-01-02",
        "downloadOptionBag": [
            {
                "mimeTypeIdentifier": "PDF",
                "downloadUrl": "https://example.test/spec.pdf",
            }
        ],
    }

    def search_application_record(**_kwargs):
        calls["search"] += 1
        return metadata

    def list_documents(_application_number, **_kwargs):
        calls["documents"] += 1
        return [document]

    def download_file(_url, out_path, **_kwargs):
        calls["download"] += 1
        path = Path(out_path)
        path.write_bytes(b"pdf")
        return path

    monkeypatch.setattr(
        "core.patent_records.search_application_record", search_application_record
    )
    monkeypatch.setattr("core.patent_records.list_documents", list_documents)
    monkeypatch.setattr("core.patent_records.download_file", download_file)
    monkeypatch.setattr(
        "core.patent_records.specification_to_text",
        lambda _path: (
            "DESCRIPTION\nUseful details.\nWhat is claimed is:\n1. A useful system."
        ),
    )

    loader = UsptoPatentLoader(api_key="secret", cache_dir=tmp_path)
    first = loader.load(identifier="12,345,678", identifier_type="patent")
    second = loader.load(identifier="12345678", identifier_type="patent")

    assert first == second
    assert first["application_number"] == "18456219"
    assert first["claims_text"] == "1. A useful system."
    assert calls == {"search": 1, "documents": 1, "download": 1}
