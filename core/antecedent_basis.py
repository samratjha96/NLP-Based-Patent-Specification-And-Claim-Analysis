## antecedent_basis.py
##
## ANTECEDENT BASIS ANALYSIS FUNCTIONS
##
## Analyzes claim text for problems like un-introduced Noun Phrases (NPs)
## and similar issues.  Returns HTML analysis for same.
##
## Author: Kirk A. Sigmon
## Last Updated: Feb. 7, 2026

import os
import threading
from dataclasses import dataclass
from typing import Dict, List, Tuple

import spacy

from config import SPACY_CACHE_DIR

# PRELIMINARY DEFINITIONAL MATERIAL --------------------------------------------

INTRO_DETS = {"a", "an"}                                          # Intro determiners
INTRO_PHRASES = ["at least one", "one or more", "a plurality of"] # Plurlity defs
DEF_DETS = {"the", "said"}                                        # Definite determiners

# LOAD CONTENT -----------------------------------------------------------------
_nlp = None
_nlp_lock = threading.Lock()


def get_nlp():
    global _nlp

    if _nlp is None:
        with _nlp_lock:
            if _nlp is None:
                model = os.environ.get(
                    "PATENTAGILITY_SPACY_MODEL",
                    "en_core_web_trf",
                )
                cached = SPACY_CACHE_DIR / model
                _nlp = spacy.load(cached if cached.exists() else model)
    return _nlp

@dataclass
class Mention:
    kind: str          # "intro" or "ref"
    text: str
    key: str
    start: int         # character start
    end: int           # character end

# Helper function to normalize a Noun Phrase (NP) chunk to a key
def _span_key(span):

    # Define the head of the Noun Phrase
    head = span.root
    mods = []

    # For each token (word-like chunk) in the span...
    for tok in span:
        # Keep stable compound nouns. Descriptive modifiers often change form
        # between an introduction and a later reference.
        if tok.dep_ == "compound" and tok.head == head:
            mods.append(tok.lemma_.lower())

    # Return a SORTED list
    mods = sorted(set(mods))
    return " ".join(mods + [head.lemma_.lower()])

# Helper function to determine whether string start with an intro phrase (a, an)
def _starts_with_intro_phrase(span_text):

    # Standardize the span text by lowercasing and stripping it down
    t = span_text.lower().strip()

    # Now, search for the intro phrases and, if so, return as much
    for p in INTRO_PHRASES:
        if t.startswith(p + " "):
            return p
    return None

# Helper function to extract Noun Phrase (NP) mentions and classify them as
# either an introduction (e.g., "a ball") versus a reference (e.g., "the ball,"
# "said ball")
def extract_np_mentions(claim_text, *, nlp=None):

    # Run SpaCy on the claim text provided
    doc = (nlp if nlp is not None else get_nlp())(claim_text)

    # Define an empty list of mentions of NPs
    mentions: List[Mention] = []

    # For each chunk available based on SpaCy processing...
    for chunk in doc.noun_chunks:

        # Define the chunk text
        chunk_text = chunk.text

        # Grab the first token
        first_tok = chunk[0].lower_

        # Now, process through and figure out if we have an
        # introduction ("a," "an") and/or definite ("the," "said")
        is_intro = False
        is_ref = False
        if (first_tok in INTRO_DETS) or (_starts_with_intro_phrase(chunk_text)):
            is_intro = True
        if first_tok in DEF_DETS:
            is_ref = True

        # SpaCy can parse a claim transition as a noun phrase with
        # "comprising" as its head. The transition is not a claim element.
        if is_ref and chunk_text.lower().strip().endswith(" comprising"):
            continue

        # If somehow we figure out if it's a pronoun, jettison this process
        if chunk.root.pos_ == "PRON":
            continue

        # If we've successfully identified the NP as an intro ("a") or
        # definite ("the")
        if is_intro or is_ref or chunk.root.pos_ in {"NOUN", "PROPN"}:

            # Convert the chunk into a corresponding key
            key = _span_key(chunk)

            # Append to our mentions list an indicator of the key
            mentions.append(Mention(
                kind="intro" if is_intro else ("ref" if is_ref else "bare"),
                text=chunk_text,
                key=key,
                start=chunk.start_char,
                end=chunk.end_char
            ))

    # Return our list of mentions
    return mentions

# Helper function to basically pocess everything and collect errors
def analyze_intro_ref(claim_text, *, nlp=None):

    # Get our list of mentions
    mentions = extract_np_mentions(claim_text, nlp=nlp)

    # Define empty placeholders for our introductions for NPs and subsequent
    # uses of those NPs
    introduced: Dict[str, List[Mention]] = {}
    refs: List[Mention] = []

    # Process mentions in source order. A later introduction cannot establish
    # antecedent basis for an earlier reference. Bare plural and mass nouns can
    # establish an element without an article.
    used_without_intro: List[Mention] = []
    referenced_keys = set()
    for m in mentions:
        if m.kind in {"intro", "bare"}:
            introduced.setdefault(m.key, []).append(m)
        else:
            refs.append(m)
            if m.key not in introduced:
                used_without_intro.append(m)
            else:
                referenced_keys.add(m.key)

    # Now, we also (somewhat) care about NPs mentioned but not later used.
    # Here, we make an empty list and walk through to find the instance
    # of the r
    introduced_never_referenced: List[Mention] = []
    for k, ms in introduced.items():
        explicit_introductions = [mention for mention in ms if mention.kind == "intro"]
        if explicit_introductions and k not in referenced_keys:
            introduced_never_referenced.append(explicit_introductions[0])

    # Return our list of mentions, introductions, references, and (perhaps most
    # importantly) the instances where we saw errors
    return {
        "mentions": mentions,
        "introduced": introduced,
        "refs": refs,
        "used_without_intro": used_without_intro,
        "introduced_never_referenced": introduced_never_referenced,
    }

# Helper function to extract instances where we have Noun Phrases (NPs) that
# are close together and comma-separated, suggesting enumeration (e.g.,
# something like "a ball, a net, a hoop")
def extract_enumerations(claim_text):

    # Char threshold for "close enough to probably be comma enumerated"
    comma_threshold = 150

    # Find all mentions in the claim text, and identify the introductons too
    mentions = extract_np_mentions(claim_text)
    intros = [m for m in mentions if m.kind == "intro"]

    # Empty variables for our enumerations
    enums: List[List[Mention]] = []
    current: List[Mention] = []

    # Roughly find enumerations
    for m in intros:
        if not current:
            current = [m]
            continue

        # Define some possible ranges
        prev = current[-1]
        between = claim_text[prev.end:m.start]
        gap = m.start - prev.end

        # If we see some sort of sufficiently small gap, we're probably
        # seeing an enumeration, so flag it as much
        if gap <= comma_threshold and ("," in between or " and " in between.lower() or " or " in between.lower() or ";" in between):
            current.append(m)
        else:
            if len(current) >= 2:
                enums.append(current)
            current = [m]
    if len(current) >= 2:
        enums.append(current)

    return enums

# Lazy HTML Highlighting for Beautification
def highlight_claim_ID_issues(claim_text: str) -> str:

    # Perform the relevant claim analysis
    analysis = analyze_intro_ref(claim_text)
    introduced = analysis["introduced"]
    referenced_keys = set(r.key for r in analysis["refs"] if r.key in introduced)
    used_wo_intro = {(m.start, m.end) for m in analysis["used_without_intro"]}
    intro_never = {(m.start, m.end) for m in analysis["introduced_never_referenced"]}

    # Define markup marks for HTML output
    marks: List[Tuple[int,int,str,str]] = []  # (start,end,color,label)

    for m in analysis["mentions"]:
        # OK Stuff
        if m.kind == "ref":
            if (m.start, m.end) in used_wo_intro:
                marks.append((m.start, m.end, "#ffcccc", "REF w/o INTRO"))
            else:
                marks.append((m.start, m.end, "#ccffcc", "REF ok"))
        # Problems
        else:
            # Introduced but not later referenced
            if (m.start, m.end) in intro_never:
                marks.append((m.start, m.end, "#fff0b3", "INTRO never ref"))
            else:
                # Introduced, might not be referenced later
                if m.key in referenced_keys:
                    marks.append((m.start, m.end, "#ccffcc", "INTRO used"))
                else:
                    marks.append((m.start, m.end, "#fff0b3", "INTRO never ref"))

    # Sort everything, keeping the longer span if there's any conflict
    marks.sort(key=lambda x: (x[0], -(x[1]-x[0])))
    filtered = []
    last_end = -1
    for s,e,c,lbl in marks:
        if s >= last_end:
            filtered.append((s,e,c,lbl))
            last_end = e

    # Output HTML for ease of viewing
    out = []
    i = 0
    for s,e,color,lbl in filtered:
        out.append(claim_text[i:s])
        frag = claim_text[s:e]
        out.append(f'<span title="{lbl}" style="background:{color}; padding:1px 2px; border-radius:3px;">{frag}</span>')
        i = e
    out.append(claim_text[i:])
    legend = """
    <div style="font-family:Arial; font-size:14px; line-height:1.4;">
      <div><b>LEGEND</b></div>
      <div><span style="background:#ccffcc; padding:1px 6px; border-radius:3px;">&nbsp;</span> OK</div>
      <div><span style="background:#fff0b3; padding:1px 6px; border-radius:3px;">&nbsp;</span> Introduced, not later used (may be OK)</div>
      <div><span style="background:#ffcccc; padding:1px 6px; border-radius:3px;">&nbsp;</span> Referenced without introduction (not OK)</div>
    </div>
    """
    body = "<div style='white-space:pre-wrap;'>" + "".join(out) + "</div>"
    return "<h2>Claim Introduction Issue Analysis</h2><br />" + legend + "<br /><br />" + body
