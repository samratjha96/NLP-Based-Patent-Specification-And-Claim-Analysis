#!/usr/bin/env python3
"""Build the browser example from official USPTO Patent Public Search HTML."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup


EXAMINER_PROFILE_PATH = (
    Path(__file__).resolve().parents[1] / "data" / "us-9922200-examiner-profile.json"
)


def section_text(soup: BeautifulSoup, heading: str, *, separator: str = "\n\n") -> str:
    title = soup.find("h3", string=lambda value: value and value.strip() == heading)
    if title is None:
        raise ValueError(f"Missing {heading!r} section")
    paragraph = next(
        (item for item in title.find_next_siblings("p") if item.get_text(strip=True)),
        None,
    )
    if paragraph is None:
        raise ValueError(f"Missing paragraph after {heading!r}")
    for line_break in paragraph.find_all("br"):
        line_break.replace_with("\n")
    lines = [
        re.sub(r"\s+", " ", line).strip() for line in paragraph.get_text().splitlines()
    ]
    return separator.join(line for line in lines if line)


def load_document(path: Path) -> dict[str, str]:
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    return {
        "abstract": section_text(soup, "Abstract"),
        "background": section_text(soup, "Background/Summary"),
        "description": section_text(soup, "Description"),
        "claims": section_text(soup, "Claims", separator="\n"),
    }


def claim(claims_text: str, number: int) -> str:
    pattern = rf"(?:^|\n){number}\.\s+(.*?)(?=\n{number + 1}\.\s|\Z)"
    match = re.search(pattern, claims_text, flags=re.DOTALL)
    if match is None:
        raise ValueError(f"Claim {number} was not found")
    return f"{number}. {match.group(1).strip()}"


def build_record(
    parent_grant: dict[str, str], continuation_grant: dict[str, str]
) -> dict:
    specification = "\n\n".join(
        [
            f"Abstract\n{parent_grant['abstract']}",
            f"Background and summary\n{parent_grant['background']}",
            f"Detailed description\n{parent_grant['description']}",
        ]
    )
    claims = parent_grant["claims"]
    return {
        "is_demo": True,
        "source": "Official USPTO Patent Public Search documents saved with this example",
        "display_identifier": "US 9,922,200 B2",
        "record_id": "example:us-9922200-b2",
        "application_number": "14319969",
        "patent_number": "9922200",
        "publication_number": "US20150379297A1",
        "title": "Securely storing content within public clouds",
        "abstract": parent_grant["abstract"],
        "status": "Granted · Mar. 20, 2018",
        "filing_date": "2014-06-30",
        "inventors": ["Galen Clyde Hunt", "Mark Eugene Russinovich"],
        "assignee": "Microsoft Technology Licensing, LLC",
        "examiner": "Samson Lemma",
        "assistant_examiner": "Narciso Victoria",
        "examiner_profile": json.loads(
            EXAMINER_PROFILE_PATH.read_text(encoding="utf-8")
        ),
        "specification_text": specification,
        "claims_text": claims,
        "principal_claim_text": claim(parent_grant["claims"], 1),
        "specification_character_count": len(specification),
        "claims_character_count": len(claims),
        "review_examples": {
            "support_queries": [
                "an area in memory that protects code and data from code and data outside the area",
                "a processor-specific public key that corresponds to a processor identifier",
                "store encrypted content on processors identified by processor identifiers",
            ],
            "examiner_query": "Samson Lemma",
        },
        "family_members": [
            {
                "application_number": "14319969",
                "publication_number": "US20150379297A1",
                "patent_number": "9922200",
                "document_number": "US9922200B2",
                "relationship": "Parent",
                "filed": "2014-06-30",
                "published": "2015-12-31",
                "granted": "2018-03-20",
                "examiner": "Samson Lemma",
            },
            {
                "application_number": "15922640",
                "publication_number": "US20190087597A1",
                "patent_number": "10831913",
                "document_number": "US10831913B2",
                "relationship": "Continuation",
                "filed": "2018-03-15",
                "published": "2019-03-21",
                "granted": "2020-11-10",
                "examiner": "Hosuk Song",
            },
        ],
        "family_events": [
            {
                "date": "2014-06-30",
                "label": "Parent filed",
                "detail": "U.S. application 14/319,969 filed.",
            },
            {
                "date": "2015-12-31",
                "label": "Parent published",
                "detail": "US 2015/0379297 A1 published.",
            },
            {
                "date": "2018-03-15",
                "label": "Continuation filed",
                "detail": "U.S. application 15/922,640 filed as a continuation.",
            },
            {
                "date": "2018-03-20",
                "label": "Parent granted",
                "detail": "US 9,922,200 B2 granted with 9 claims.",
            },
            {
                "date": "2019-03-21",
                "label": "Continuation published",
                "detail": "US 2019/0087597 A1 published.",
            },
            {
                "date": "2020-11-10",
                "label": "Continuation granted",
                "detail": "US 10,831,913 B2 granted.",
            },
        ],
        "family_claims": [
            {
                "label": "Parent grant",
                "document_number": "US 9,922,200 B2",
                "claim_number": 1,
                "claim_text": claim(parent_grant["claims"], 1),
            },
            {
                "label": "Parent grant",
                "document_number": "US 9,922,200 B2",
                "claim_number": 5,
                "claim_text": claim(parent_grant["claims"], 5),
            },
            {
                "label": "Parent grant",
                "document_number": "US 9,922,200 B2",
                "claim_number": 7,
                "claim_text": claim(parent_grant["claims"], 7),
            },
            {
                "label": "Continuation grant",
                "document_number": "US 10,831,913 B2",
                "claim_number": 1,
                "claim_text": claim(continuation_grant["claims"], 1),
            },
            {
                "label": "Continuation grant",
                "document_number": "US 10,831,913 B2",
                "claim_number": 6,
                "claim_text": claim(continuation_grant["claims"], 6),
            },
            {
                "label": "Continuation grant",
                "document_number": "US 10,831,913 B2",
                "claim_number": 14,
                "claim_text": claim(continuation_grant["claims"], 14),
            },
        ],
        "prosecution_history": [
            {
                "label": "Parent",
                "application_number": "14319969",
                "patent_number": "9922200",
                "filed": "2014-06-30",
                "events": [
                    {
                        "date": "2015-11-25",
                        "type": "office_action",
                        "label": "Non-final rejection",
                    },
                    {
                        "date": "2016-04-25",
                        "type": "amendment",
                        "label": "Claim amendment",
                    },
                    {
                        "date": "2016-08-11",
                        "type": "office_action",
                        "label": "Final rejection",
                    },
                    {
                        "date": "2016-12-12",
                        "type": "amendment",
                        "label": "Claim amendment",
                    },
                    {
                        "date": "2017-11-08",
                        "type": "allowance",
                        "label": "Notice of allowance",
                    },
                ],
                "snapshots": [
                    {
                        "date": "2016-04-25",
                        "title": "Response after the first rejection",
                        "changes": [
                            "Specified a cloud provided by a cloud provider.",
                            "Added receipt of encrypted content from the content owner.",
                            "Added storage on the selected processor and decryption inside its secure enclave.",
                        ],
                    },
                    {
                        "date": "2016-12-12",
                        "title": "Response after the final rejection",
                        "changes": [
                            "Added access by content owners to the processor-identifier set.",
                            "Added the manufacturer or associated third party as the source of processor-specific public keys.",
                            "Recast the management-engine claim and cancelled claims 10 through 13.",
                        ],
                    },
                ],
            },
            {
                "label": "Continuation",
                "application_number": "15922640",
                "patent_number": "10831913",
                "filed": "2018-03-15",
                "events": [
                    {
                        "date": "2019-09-30",
                        "type": "office_action",
                        "label": "Non-final rejection",
                    },
                    {
                        "date": "2019-12-27",
                        "type": "amendment",
                        "label": "Claim amendment",
                    },
                    {
                        "date": "2020-01-15",
                        "type": "office_action",
                        "label": "Final rejection",
                    },
                    {
                        "date": "2020-07-07",
                        "type": "allowance",
                        "label": "Notice of allowance",
                    },
                ],
                "snapshots": [
                    {
                        "date": "2019-12-27",
                        "title": "Continuation response",
                        "claim_number": 1,
                        "before_claim_text": (
                            "A method performed by one or more computing devices for "
                            "securely storing content in a cloud, the method comprising: "
                            "providing one or more processors having secure enclave "
                            "capability, each processor having a processor identifier "
                            "associated therewith, wherein the secure enclave capability "
                            "comprises an ability to create an area within memory of a "
                            "computing device for storing code and data that is protected "
                            "from code and data outside of the area; receiving a set of "
                            "processor identifiers, each processor identifier of the set "
                            "being associated with a processor of the one or more processors "
                            "and having been selected for storing content; and providing a "
                            "processor-specific public key corresponding to each processor "
                            "identified by the set of processor identifiers."
                        ),
                        "after_claim_text": (
                            "A method performed by one or more computing devices for "
                            "securely storing content in a cloud, the method comprising: "
                            "providing one or more processors having secure enclave "
                            "capability to a cloud provider, each processor having a "
                            "processor identifier associated therewith, wherein the secure "
                            "enclave capability comprises an ability to create an area "
                            "within memory of a computing device for storing code and data "
                            "that is protected from code and data outside of the area; "
                            "receiving a set of processor identifiers from a content owner, "
                            "each processor identifier of the set being associated with a "
                            "processor of the one or more processors provided to the cloud "
                            "provider and having been selected for storing content; and "
                            "providing a processor-specific public key corresponding to each "
                            "processor identified by the set of processor identifiers."
                        ),
                        "diff_source": "Public response filed December 27, 2019",
                        "diff_note": (
                            "Non-substantive OCR spacing was removed from the public "
                            "amendment text."
                        ),
                        "changes": [
                            "Focused the independent claims on processor publication, content-owner selection, and processor-specific keys.",
                            "Preserved separate method, storage-media, and system claim forms.",
                        ],
                    }
                ],
            },
        ],
        "family_data_warnings": [
            "The source family resolver also returned application 01/538,204. Its number and filing date are inconsistent with this family, so this example excludes it from claim analysis."
        ],
        "art_unit_prediction_example": {
            "source": "Verified authenticated PatentAgility result captured 2026-07-21",
            "input_description": "Secure-cloud invention text about processor identifiers, public encryption keys, and hardware secure enclaves.",
            "class_count": 588,
            "predictions": [
                {
                    "art_unit": "2494",
                    "probability": 11.7,
                    "group": "2490 - Cryptography and Cybersecurity",
                    "tech_center": "2400",
                },
                {
                    "art_unit": "2434",
                    "probability": 8.6,
                    "group": "2430 - Cryptography and Cybersecurity",
                    "tech_center": "2400",
                },
                {
                    "art_unit": "2432",
                    "probability": 6.8,
                    "group": "2430 - Cryptography and Cybersecurity",
                    "tech_center": "2400",
                },
                {
                    "art_unit": "2437",
                    "probability": 6.3,
                    "group": "2430 - Cryptography and Cybersecurity",
                    "tech_center": "2400",
                },
                {
                    "art_unit": "2497",
                    "probability": 6.2,
                    "group": "2490 - Cryptography and Cybersecurity",
                    "tech_center": "2400",
                },
            ],
        },
        "classification_records": [
            {
                "scheme": "CPC",
                "code": "G06F 21/6218",
                "description": "Official classification code from the grant",
            },
            {
                "scheme": "CPC",
                "code": "G06F 21/10",
                "description": "Official classification code from the grant",
            },
            {
                "scheme": "CPC",
                "code": "H04L 9/08",
                "description": "Official classification code from the grant",
            },
            {
                "scheme": "CPC",
                "code": "H04L 63/0442",
                "description": "Official classification code from the grant",
            },
            {
                "scheme": "CPC",
                "code": "H04L 63/062",
                "description": "Official classification code from the grant",
            },
        ],
        "coverage_candidates": [
            {
                "title": "Secure enclave migration between processors",
                "evidence": "Description paragraphs (40)–(42) explain migration for load balance and maintenance.",
                "claim_check": "Review both grants for an express migration limitation.",
            },
            {
                "title": "On-demand packages for new processors",
                "evidence": "Description paragraph (42) explains how code can produce packages for added processors.",
                "claim_check": "Review whether the continuation claims capture this update path.",
            },
            {
                "title": "Collocation of separate content-owner enclaves",
                "evidence": "Description paragraph (40) describes secure collocation on one server.",
                "claim_check": "Review the granted claims for an express collocation limitation.",
            },
        ],
        "source_documents": [
            {
                "label": "Parent publication",
                "document_number": "US20150379297A1",
                "url": "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/20150379297",
            },
            {
                "label": "Parent grant",
                "document_number": "US9922200B2",
                "url": "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9922200",
            },
            {
                "label": "Continuation publication",
                "document_number": "US20190087597A1",
                "url": "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/20190087597",
            },
            {
                "label": "Continuation grant",
                "document_number": "US10831913B2",
                "url": "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10831913",
            },
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parent-grant", type=Path, required=True)
    parser.add_argument("--continuation-grant", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    record = build_record(
        load_document(args.parent_grant), load_document(args.continuation_grant)
    )
    payload = json.dumps(record, ensure_ascii=False, indent=2)
    args.output.write_text(
        f"window.PatentAgilityDemoRecord = {payload};\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
