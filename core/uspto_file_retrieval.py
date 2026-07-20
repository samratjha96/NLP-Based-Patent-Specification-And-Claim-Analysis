## uspto_file_retrieval.py
##
## USPTO FILE RETRIEVAL FUNCTIONS
##
## Retrieves files (generally, specifications) for a given patent application/number
## using the USPTO's API.  Requires pre-established API_KEY.
##
## Author: Kirk A. Sigmon
## Last Updated: Feb. 7, 2026

## ----------------------------------------------------------
## IMPORTS
## ----------------------------------------------------------

import re
from pathlib import Path
import requests

## ----------------------------------------------------------
## USPTO COMMUNICATIONS VIA API
## ----------------------------------------------------------

# Base USPTO API URL
BASE_URL = "https://api.uspto.gov/api/v1"


# Session instantiation
def _session(API_KEY: str | None):
    s = requests.Session()
    s.headers.update({"Accept": "application/json"})
    if API_KEY:
        s.headers.update({"x-api-key": API_KEY})
    return s


# Clean up digits, just in case
def _clean_digits(s):
    return re.sub(r"\D+", "", s or "")


# Find the first key in the JSON
def _find_first_key(obj, keys):
    if isinstance(obj, dict):
        for k in keys:
            if k in obj and obj[k]:
                return obj[k]
        for v in obj.values():
            hit = _find_first_key(v, keys)
            if hit is not None:
                return hit
    elif isinstance(obj, list):
        for it in obj:
            hit = _find_first_key(it, keys)
            if hit is not None:
                return hit
    return None


def search_application_record(*, patent_number=None, application_number=None, API_KEY):
    if not patent_number and not application_number:
        raise ValueError("ERROR: Need patent or application number.")

    params = {"limit": 1, "offset": 0}
    if application_number:
        params["applicationNumberQ"] = _clean_digits(application_number)
    else:
        params["patentNumberQ"] = _clean_digits(patent_number)

    response = _session(API_KEY).get(
        f"{BASE_URL}/patent/applications/search",
        params=params,
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()
    records = _find_first_key(
        data,
        ["patentFileWrapperDataBag", "results", "items", "applications"],
    )
    if isinstance(records, list):
        if not records:
            raise RuntimeError("No matching USPTO application was found.")
        return records[0]
    if isinstance(data, dict) and _find_first_key(
        data, ["applicationNumberText", "applicationNumber", "application_number"]
    ):
        return data
    raise RuntimeError("No matching USPTO application was found.")


# Resolve application number using USPTO API.  Supports both application_number_q and patent_number_q
def resolve_application_number(*, patent_number, application_number, API_KEY):

    # If we have an app number already, bail unless it's formatted wrong
    # Also bail if we get nothing to work with.
    if application_number:
        app_no = _clean_digits(application_number)
        if len(app_no) < 8:
            raise RuntimeError(f"Application number looks wrong: {app_no!r}")
        return app_no
    if not patent_number:
        raise ValueError("ERROR: Need patent or application number.")

    data = search_application_record(
        patent_number=patent_number,
        application_number=application_number,
        API_KEY=API_KEY,
    )

    # Try common field spellings first; fall back to best-effort scan.
    app_no = _find_first_key(
        data, ["applicationNumberText", "applicationNumber", "application_number"]
    )
    if not app_no:
        raise RuntimeError(
            "ERROR: Couldn't locate application number in search response."
        )

    # Otherwise, try to clean up, but complain if there's an issue.
    app_no = _clean_digits(str(app_no))
    if len(app_no) < 8:
        raise RuntimeError(f"Resolved application number looks wrong: {app_no!r}")

    return app_no


# List documents for a particular application number
def list_documents(application_number, *, API_KEY):

    # Instantiate the session and the application of interest
    s = _session(API_KEY)
    application_number = _clean_digits(application_number)

    # Establish our endpoint
    url = f"{BASE_URL}/patent/applications/{application_number}/documents"
    r = s.get(url, timeout=60)
    r.raise_for_status()
    data = r.json()

    # Try to grab what we can, essentially just hunt for the documents
    docs = (
        _find_first_key(data, ["documents", "documentBag", "document_bag"])
        or _find_first_key(data, ["results", "items"])
        or []
    )
    if not isinstance(docs, list):
        docs = docs if isinstance(docs, list) else []
    return docs


# Function to pick specification document amongst various documents
def pick_spec_doc(docs, which="earliest"):
    spec_docs = [d for d in docs if str(d.get("documentCode", "")).upper() == "SPEC"]
    if not spec_docs:
        raise RuntimeError("No SPEC documents found in docs list.")

    def date_key(d):
        # ISO-ish string sorts chronologically; keep as string for simplicity
        return str(d.get("officialDate") or "")

    if which == "latest":
        return max(spec_docs, key=date_key)
    elif which == "earliest":
        return min(spec_docs, key=date_key)
    else:
        raise ValueError("which must be 'earliest' or 'latest'")


# Function to identify PDF to download from USPTO records
def get_pdf_download_url(doc):
    bag = doc.get("downloadOptionBag") or []
    for opt in bag:
        if str(opt.get("mimeTypeIdentifier", "")).upper() == "PDF" and opt.get(
            "downloadUrl"
        ):
            return opt["downloadUrl"]
    for opt in bag:
        if opt.get("downloadUrl"):
            return opt["downloadUrl"]
    raise RuntimeError("No downloadUrl found for this document.")


# Function to download USPTO file
def download_file(url, out_path, *, api_key=None):
    s = requests.Session()
    if api_key:
        s.headers.update({"x-api-key": api_key})
    with s.get(url, stream=True, timeout=120) as r:
        r.raise_for_status()
        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with out_path.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 256):
                if chunk:
                    f.write(chunk)
    return out_path


# Function to download the SPECIFICATION itself - grabs pat/app number, resolves app
# if patent number provided, figures out docs in file wrapper, guesses spec, then downloads it.
def download_specification(
    *,
    patent_number=None,
    application_number=None,
    API_KEY,
    out_dir="temp/uspto_pfw_downloads",
):

    # Resolve the application number
    app_no = resolve_application_number(
        patent_number=patent_number,
        application_number=application_number,
        API_KEY=API_KEY,
    )

    # Grab the documents, and do a best-effort guess of the specification docuemnt
    docs = list_documents(app_no, API_KEY=API_KEY)
    spec_doc = pick_spec_doc(docs, which="earliest")

    # Get the URL of the best-guess specification docuemnt
    url = get_pdf_download_url(spec_doc)

    # Go ahead and download the file
    out_dir = Path(out_dir)
    out_path = out_dir / f"{app_no}_SPEC_{spec_doc['documentIdentifier']}.pdf"
    out = download_file(url, out_path, api_key=API_KEY)
    return out
