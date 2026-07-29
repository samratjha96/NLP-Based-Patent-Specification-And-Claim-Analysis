## ocr.py
##
## BASIC OCR FUNCTIONS FOR USPTO PDFS
##
## Converts USPTO PDFs into text
##
## Author: Kirk A. Sigmon
## Last Updated: Feb. 7, 2026

## ----------------------------------------------------------
## IMPORTS
## ----------------------------------------------------------

import re
from pdf2image import convert_from_path
import pytesseract
from pypdf import PdfReader

## ----------------------------------------------------------
## OCR FUNCTIONS
## ----------------------------------------------------------

# Function to "unwrap" (that is, remove excessive newlines from) patent text.
# Lots of temporary hacks here to handle issues like new page breaks.
def unwrap_ocr_text(s):

    WS = re.compile(r"[ \t]+")
    if not s:
        return ""

    # Simplistic newline clean-ups
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"(\w)-[ \t]*\n[ \t]*(\w)", r"\1\2", s)
    s = re.sub(r"[ \t]+", " ", s)

    # Normalize spaces if any remain
    s = WS.sub(" ", s)

    # Protect page breaks so they cannot create blank lines
    s = re.sub(r"\s*<<<PAGE_BREAK>>>\s*", " __PB__ ", s)

    # Paragraph numbers become boundaries
    s = re.sub(r"\[\s*(\d{3,5})\s*\]", lambda m: f"\n\n[{m.group(1)}] ", s)

    # Now split on blank lines
    blocks = re.split(r"\n\s*\n+", s)

    # Iterate through the blocks and clean up further
    cleaned_blocks = []
    for blk in blocks:
        blk = blk.strip()
        if not blk:
            continue

        # Now unwrap, clean up page breaks, and strip addendum
        blk = re.sub(r"\s*\n\s*", " ", blk)
        blk = blk.replace("__PB__", " ")
        blk = re.sub(r"\s{2,}", " ", blk).strip()
        cleaned_blocks.append(blk)

    # Re-join blocks with a single blank line between paragraphs
    return "\n\n".join(cleaned_blocks)

# Quick extraction of PDF text using USPTO-provided text (if it's embedded)
def extract_pdf_text_fast(pdf_path, *, max_pages=500):
    reader = PdfReader(pdf_path)
    n = min(len(reader.pages), max_pages if max_pages is not None else len(reader.pages))
    parts = []
    for i in range(n):
        try:
            parts.append(reader.pages[i].extract_text() or "")
        except Exception:
            parts.append("")
    text = "\n".join(parts).replace("\r\n", "\n").replace("\r", "\n")
    return text.strip()

# Backup option, function to OCR retrieved USPTO PDF
def ocr_specification(
    pdf_path,
    *,
    dpi=300,
    crop=(0.07, 0.08, 0.07, 0.08),
    max_pages=500,
    poppler_path=None,
    page_segmentation_mode=6,
    page_at_a_time=False,
):

    # Identify where Tesseract is
    from config import TESSERACT_CMD
    pytesseract.pytesseract.tesseract_cmd = str(TESSERACT_CMD)

    # Definition of OCR-identified page breaks
    PAGE_BREAK = "\n<<<PAGE_BREAK>>>\n"
    
    # Identify pages, cull them if we got an unusually large specification from
    # some over-zealous drafter
    if page_at_a_time:
        page_count = len(PdfReader(pdf_path).pages)
        if max_pages is not None:
            page_count = min(page_count, max_pages)

        def pages():
            for page_number in range(1, page_count + 1):
                yield convert_from_path(
                    pdf_path,
                    dpi=dpi,
                    first_page=page_number,
                    last_page=page_number,
                    poppler_path=poppler_path,
                )[0]

        page_images = pages()
    else:
        page_images = convert_from_path(
            pdf_path,
            dpi=dpi,
            poppler_path=poppler_path,
        )
        if max_pages is not None:
            page_images = page_images[:max_pages]
    text_pages = []

    # For each page...
    for img in page_images:

        # Perform a lazy crop to get rid of headers within reason
        w, h = img.size
        left = int(w * crop[0])
        t = int(h * crop[1])
        r = int(w * (1 - crop[2]))
        b = int(h * (1 - crop[3]))
        img = img.crop((left, t, r, b))
        
        # Convert to a string using pytesseract
        txt = pytesseract.image_to_string(
            img,
            lang="eng",
            config=f"--oem 1 --psm {page_segmentation_mode}",
        )
        text_pages.append(txt)

    # Merge output
    full_text = PAGE_BREAK.join(text_pages)
    
    # Output the totality of the pages
    return unwrap_ocr_text(full_text)


def patent_grant_to_text(pdf_path, *, max_pages=500, poppler_path=None):
    extracted = extract_pdf_text_fast(pdf_path, max_pages=max_pages)
    if len(extracted) >= 2000:
        return unwrap_ocr_text(extracted)

    return ocr_specification(
        pdf_path,
        dpi=200,
        crop=(0.05, 0.07, 0.05, 0.07),
        max_pages=max_pages,
        poppler_path=poppler_path,
        page_segmentation_mode=3,
        page_at_a_time=True,
    )

## ----------------------------------------------------------
## SINGLE FLASK-FRIENDLY FUNCTION
## ----------------------------------------------------------

def specification_to_text(
    pdf_path,
    *,
    prefer_text_layer=True,
    min_chars_for_text_layer=2000,
    dpi=300,
    crop=(0.07, 0.08, 0.07, 0.08),
    max_pages=500,
    poppler_path=None,
):
    # If we are configured to do so and can grab enough characters from embedded text,
    # use that and skip slow OCR processes
    if prefer_text_layer:
        extracted = extract_pdf_text_fast(pdf_path, max_pages=max_pages)
        if len(extracted) >= min_chars_for_text_layer:
            return unwrap_ocr_text(extracted)

    # That said, worst case scenario, perform OCR
    return ocr_specification(
        pdf_path,
        dpi=dpi,
        crop=crop,
        max_pages=max_pages,
        poppler_path=poppler_path,
    )
