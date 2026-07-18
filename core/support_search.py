## support_search.py
##
## SUPPORT ANALYSIS VIA BGE-M3 / BM25 + BGE-RERANKER
##
## Processes specification text and uses it to analyze input textual queries
## for support.  Generally, this helps identify possible support (and/or deficiencies
## in support).
##
## Author: Kirk A. Sigmon
## Last Updated: Feb. 7, 2026

## ----------------------------------------------------------
## IMPORTS
## ----------------------------------------------------------

# Generic imports/IO
import os
import re
import threading
from html import escape
from pathlib import Path

from config import HF_CACHE_DIR, SPACY_CACHE_DIR

# Ensure cache dirs exist and force HuggingFace caches into temp folder
HF_CACHE_DIR = Path(HF_CACHE_DIR)
SPACY_CACHE_DIR = Path(SPACY_CACHE_DIR)

HF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
SPACY_CACHE_DIR.mkdir(parents=True, exist_ok=True)

os.environ.setdefault("HF_HOME", str(HF_CACHE_DIR))
os.environ.setdefault("TRANSFORMERS_CACHE", str(HF_CACHE_DIR))
os.environ.setdefault("HF_HUB_CACHE", str(HF_CACHE_DIR))

# NLP Models for Tokenization, Embeddings, Etc. These imports must happen after
# configuring the Hugging Face cache because the libraries read it at import time.
import numpy as np  # noqa: E402
import spacy  # noqa: E402
import torch  # noqa: E402
from rank_bm25 import BM25Okapi  # noqa: E402
from sentence_transformers import CrossEncoder, SentenceTransformer  # noqa: E402

# Out of an abundance of caution, define a lock
# for use when loading the aforementioned (big) NLP models
_model_lock = threading.Lock()

## ----------------------------------------------------------
## TEXT SPLITTING FUNCTIONALITY
## ----------------------------------------------------------

# Splitting rules
PARA_SPLIT = re.compile(r"\n\s*\n+")       # Paragraphs defined as newlines
TOKEN_RE = re.compile(r"[A-Za-z0-9]+")     # Tokens generally defined by contiguous alphanumeric split by whitespace

# Helper abbreviations ("FIG.," "U.S.") that commonly trip up sentence-level splitting in spaCy
ABBR_END = re.compile(
    r"(?:\bFIGS?\.|\bFIG(?:URE)?S?\.|\bU\.?\s*S\.?|\bU\.?\s*K\.?|\bE\.?\s*U\.?|\bNO\.|\bNOS\.|\bPAT\.|\bPCT\.|\bAPP(?:L)?\.|\bAPPLN\.|\bPUB(?:L)?\.|\bINC\.|\bCO\.|\bCORP\.|\bLTD\.|\bLLC\.|\bDR\.|\bMR\.|\bMRS\.|\bMS\.|\bet\s+al\.|\betc\.)\s*$",
    re.IGNORECASE
)
CONTINUATION_START = re.compile(
    r"^\s*((and|or|wherein|whereby|that|which|who|whose|including|comprising)\b|[a-z]|\d|\([0-9A-Za-z]+\)|[A-Z]\d+|[,:;])",
    re.IGNORECASE
)

# Simplistic function for splitting paragraphs based on PARA_SPLIT
def split_paragraphs(text):
    return [p.strip() for p in PARA_SPLIT.split(text or "") if p.strip()]

# Function to split sentences using spaCy
def split_sentences(paragraph):

    # Make sure that our NLP models are loaded for sentence splitting
    if _nlp is None:
        init_models()

    # Grab the paragraphs, and generally try to normalize whitespace, tabs, etc.
    paragraph = re.sub(r"[ \t\r\f\v]+", " ", (paragraph or "").strip())
    paragraph = re.sub(r"\s*\n\s*", " ", paragraph)

    # Perform sentence-level splitting with SpaCy
    doc = _nlp(paragraph)
    sents = [s.text.strip() for s in doc.sents if s.text.strip()]

    # Merge false sentence breaks after abbreviations like "FIGS." using
    # the rules/definitions defined above.  This essentially merges the corresponding
    # content into another sentence, avoiding small sentences (which tend to overmatch anyway).
    merged = []
    i = 0
    while i < len(sents):
        cur = sents[i]
        while (
            i + 1 < len(sents)
            and ABBR_END.search(cur)
            and CONTINUATION_START.search(sents[i + 1])
        ):
            cur = f"{cur} {sents[i + 1]}".strip()
            i += 1
        merged.append(cur)
        i += 1

    return merged

## ----------------------------------------------------------
## EMBEDDING MODELS
## ----------------------------------------------------------

# At init, don't load any of our NLP models.
_nlp = None
embedder = None
reranker = None

# Function to initialize NLP models (can be time-consuming!)
# Using SpaCy for sentence-level splitting, using spaCy as desired.
# Note that we could load a blank spaCy instance just for sentence splitting,
# but this model does double duty for lemmatization as well, so we want
# the whole thing in-hand for later. We could arguably go through and jettison some
# features, like NER, but I keep 'em here because I secretly suspect I could use them later
# for some clever tricks.
# Define our embedder (BGE-M3) and BGE-based re-ranker.  Both are provided by BAAI and
# are, generally, some of the best-in-class for LOCAL performance of such tasks, at least
# in this domain and when constrained to English.
def default_device():
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def init_models(
    *,
    spacy_model = "en_core_web_sm",
    embedder_name = "BAAI/bge-m3",
    reranker_name = "BAAI/bge-reranker-large",
    device_override = None,
):

    # Use an available GPU backend when possible; model initialization and inference
    # are otherwise CPU-bound and can be painfully slow.
    device = device_override or default_device()

    global _nlp, embedder, reranker

    with _model_lock:
        # spaCy
        if _nlp is None:
            cached_path = Path(SPACY_CACHE_DIR) / spacy_model
            _nlp = spacy.load(cached_path if cached_path.exists() else spacy_model, disable=["ner"])

        # SentenceTransformer
        if embedder is None:
            embedder = SentenceTransformer(embedder_name, device=device)

        # CrossEncoder
        if reranker is None:
            reranker = CrossEncoder(reranker_name, device=device)

# Embedding functionality, uses the embedder (here, BGE-M3) to encode
# while standardizing conversion parameters.
def dense_embed_texts(texts: list[str], batch_size: int = 32, normalize: bool = True) -> np.ndarray:

    # Make sure we can encode
    if embedder is None:
        init_models()

    return embedder.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=normalize,
    ).astype(np.float32)

# Reranking function, uses the BGE-Reranker-Large model to re-rank the scores.
def rerank(query, candidates, batch_size = 16):

    # Make sure our reranker is loaded...
    if reranker is None:
        init_models()

    pairs = [(query, c) for c in candidates]
    scores = reranker.predict(pairs, batch_size=batch_size)
    return np.asarray(scores, dtype=np.float32)

# BM25 retrieval function, uses the BM25 lexical scoring to get top-k results
def bm25_retrieve(query, bm25, *, k=300):
    q_tokens = bm25_tokenize(query)
    scores = np.asarray(bm25.get_scores(q_tokens), dtype=np.float32)
    idx = topk_indices(scores, k)
    return [(int(i), float(scores[i])) for i in idx]

# DENSE retrieval function, uses the DENSE embeddings to get top-k results
def dense_retrieve(query, sent_emb, *, k=300):
    q = dense_embed_texts([query], batch_size=1, normalize=True)[0]
    scores = (sent_emb @ q).astype(np.float32)
    idx = topk_indices(scores, k)
    return [(int(i), float(scores[i])) for i in idx]

# FUSION function for BM25 + DENSE, basically just merges top-k results
# using weights
def rrf_fuse(bm25_hits, dense_hits, *, k_rrf = 60, w_bm25 = 1.0, w_dense = 1.0, top_n = 200):

    # Grab the rankings in an easily comparable way through enumeration
    bm25_rank = {idx: r for r, (idx, _) in enumerate(bm25_hits, start=1)}
    dense_rank = {idx: r for r, (idx, _) in enumerate(dense_hits, start=1)}

    # For each, fuse based on our weight (w_bm25 for BM25, w_dense for Dense).
    fused = {}
    for idx in (set(bm25_rank) | set(dense_rank)):
        s = 0.0
        if idx in bm25_rank:
            s += w_bm25 * (1.0 / (k_rrf + bm25_rank[idx]))
        if idx in dense_rank:
            s += w_dense * (1.0 / (k_rrf + dense_rank[idx]))
        fused[idx] = s

    # Generate and output the top-n results of the fused list.
    items = list(fused.items())
    items.sort(key=lambda x: x[1], reverse=True)
    return items[:top_n]

## ----------------------------------------------------------
## BUILD PARA/SENTENCE INVENTORY
## ----------------------------------------------------------

# Build our paragraph/sentence inventory along with BM25 embeddings + dense sentence embeddings.
# This returns a lot of stuff, including the BM25 itself, the sentence embeddings, etc.
def build_support_index(patent_full_text: str, *, dense_batch_size: int = 256):

    # Grab the specification text, split the paragraphs using our rough splitting definition
    # that largely relies on newlines.
    paragraphs = split_paragraphs(patent_full_text)

    # Set up empty holders for sentences, metadata, paragraph-to-sentence identifiers (since a sentence might
    # "pop" as relevant and cause us to recommend citation of the whole paragraph).
    sentences: list[str] = []
    meta: list[tuple[int, int]] = []
    para_to_sentence_idxs: list[list[int]] = [[] for _ in range(len(paragraphs))]

    # For each paragraph...
    for pi, p in enumerate(paragraphs):

        # Split the paragraph into discrete sentences
        sents = split_sentences(p)

        # For each sentence...
        for si, s in enumerate(sents):

            # Grab the sentence, append the sentence to our keeper, and log metadata appropriately
            gi = len(sentences)
            sentences.append(s)
            meta.append((pi, si))
            para_to_sentence_idxs[pi].append(gi)

    # Make sure we have enough to work with
    if not sentences:
        raise ValueError("No sentences extracted from input text; cannot build index.")

    # Perform BM25-style tokenization
    bm25_corpus = [bm25_tokenize(s) for s in sentences]
    bm25 = BM25Okapi(bm25_corpus)

    # Perform DENSE-style tokenization
    sent_emb = dense_embed_texts(sentences, batch_size=dense_batch_size, normalize=True)

    # Return the BM25-style tokenizations, DENSE-style tokenizations, sentences, etc.
    return bm25, sent_emb, sentences, meta, para_to_sentence_idxs

## -----------------------------
## SEARCH FUNCTIONALITY
## -----------------------------

# BM25-level tokenization using TOKEN_RE rules
def bm25_tokenize(text):
    return TOKEN_RE.findall((text or "").lower())

# Function to return top-k scores WITHOUT sorting the array. Marginally faster.
def topk_indices(scores: np.ndarray, k: int):
    if k <= 0:
        return np.array([], dtype=int)
    else:
        k = min(k, scores.shape[0])
        idx = np.argpartition(scores, -k)[-k:]
        return idx[np.argsort(scores[idx])[::-1]]

# Function to conduct a search in a manner that ultimately
# leverages BOTH BM25 and Dense embeddings.
def support_search_using_query(query, *, bm25, sent_emb, sentences, meta, bm25_k = 300, dense_k = 300, fused_top_n = 200, rerank_top_n = 50, rerank_batch_size = 16):

    # Retrieve the BM25 and Dense hits based on the query
    bm25_hits = bm25_retrieve(query, bm25, k=bm25_k)
    dense_hits = dense_retrieve(query, sent_emb, k=dense_k)

    # Fuse the results into a single set of query hits, organize 'em
    fused = rrf_fuse(bm25_hits, dense_hits, top_n=fused_top_n)
    cand_idx = [idx for idx, _ in fused]
    cand_text = [sentences[i] for i in cand_idx]

    # Use the re-ranker to re-rank the FUSED results, providing additional accuracy
    rr_scores = rerank(query, cand_text, batch_size=rerank_batch_size)
    rerank_top_n = min(rerank_top_n, len(rr_scores))
    order = topk_indices(rr_scores, rerank_top_n)

    # For each hit, build a nice hits list with detail, including the paragraph ID,
    # sentence ID, and the reranker score (note: not the BM25/dense scores).
    hits = []
    for j in order:
        sidx = cand_idx[int(j)]
        pi, si = meta[sidx]
        hits.append(
            {
                "paragraph_id": pi,
                "sentence_id": si,
                "score": float(rr_scores[int(j)]),
                "sentence": sentences[sidx],
                "sentence_global_idx": sidx,
            }
        )
    return hits

## ----------------------------------------------------------
## DISPLAY FUNCTIONALITY
## Mostly nice beautification, highlighting, etc.
## ----------------------------------------------------------

# Words to basically ignore when grabbing query terms to highlight, these
# have virtually no probative value and, if used in a query, could cause
# wild over-highlighting
DEFAULT_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "with",
    "on", "by", "at", "from", "as", "is", "are", "be", "being", "been",
    "using", "use", "used", "based"
}

# Extracts query terms from a query, largely just for highlighting
def extract_query_terms(query, min_len = 3):

    # If we have no query, do nothing
    if not query:
        return []

    # Tokenize (roughly) the query
    tokens = re.findall(r"\b\w+\b", query.lower())

    # Determine terms as long as they are over a sufficient length and
    # aren't a stopword
    terms = [t for t in tokens if len(t) >= min_len and t not in DEFAULT_STOPWORDS]

    # Build a list of remaining terms and output the same
    seen, out = set(), []
    for t in terms:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out

# Highlights HTML in a nice way for output
def highlight_html(text):
    return (
        "<span style='background-color:#fff3cd;"
        "border-bottom:2px solid #f0ad4e;padding:0.1em 0.25em;font-weight:400;'>"
        f"{text}</span>"
    )

# Underlines HTML in a nice way for output
def underline_html(text):
    return (
        "<span style='text-decoration: underline;"
        "text-decoration-thickness: 1px;text-decoration-color: #888;'>"
        f"{text}</span>"
    )


# Function to bold verbatim(-ish - uses lemmas) words
def bold_lemmas_in_sentence_html(sentence, query_lemmas, *, nlp, stopwords):

    # Use the NLP model to process the sentence anew
    tokenized_sentence = nlp(sentence)
    out = []
    last = 0

    # For each token...
    for tok in tokenized_sentence:

        # Include any text (e.g., spaces, punctuation) after previous token
        if tok.idx > last:
            out.append(escape(sentence[last:tok.idx]))

        # Identify the token text
        token_text = sentence[tok.idx : tok.idx + len(tok.text)]
        token_html = escape(token_text)

        # Decide whether to bold this token
        if (
            not tok.is_space
            and not tok.is_punct
            and tok.lower_ not in stopwords
            and tok.lemma_.lower() in query_lemmas
        ):
            token_html = f"<strong>{token_html}</strong>"

        out.append(token_html)
        last = tok.idx + len(tok.text)

    # Trailing text after the last token
    if last < len(sentence):
        out.append(escape(sentence[last:]))

    return "".join(out)

# Function to compute query lemmas using SpaCy, results in a small speed increase
# relative to doing so repeatedly
def compute_query_lemmas(query_terms, nlp):
    query_lemmas = set()
    for term in query_terms:
        query_lemmas.update(
            tok.lemma_.lower()
            for tok in nlp(term.lower())
            if not tok.is_punct and not tok.is_space
        )
    return query_lemmas

# Function to output support in an nice, HTML-formatted way
def render_sentence_support_html(
    sentence_hits,
    query,
    *,
    sentences,
    para_to_sentence_idxs,
    extract_query_terms_fn,
    highlight_html_fn,
    underline_html_fn,
    nlp,
    stopwords,
    min_score=-1e9,
    strong_score=0.4,
    max_results=5,
):

    # Grab the query terms (ignoring short terms and stopwords) and lemmatize
    query_terms = extract_query_terms_fn(query)
    query_lemmas = compute_query_lemmas(query_terms, nlp)
    shown = 0
    blocks = []

    # For each of the sentence hits...
    for h in sentence_hits:

        # If the score is too low, do nothing
        if h["score"] < min_score:
            break

        # If the score IS high enough, then grab the paragraph identifier(s)
        pi = h["paragraph_id"]
        target_gi = h["sentence_global_idx"]

        # Once we've identified it, safely clean up the relevant text, determine
        # whether the sentence contains any of the terms (lemmatized), and highlight
        # high-scoring sentences
        rendered = []
        for gi in para_to_sentence_idxs[pi]:
            if gi == target_gi:

                # HTML with lemma-based bolding. Note that in some (intentional!) circumstances
                # we could bold but later not highlight a sentence - this might be where
                # the word is present but the sentence as a whole is not particularly related to
                # defining that word, so it's there but probably discussing something orthogonal.

                safe_html = bold_lemmas_in_sentence_html(
                    sentences[gi],
                    query_lemmas,
                    nlp=nlp,
                    stopwords=stopwords,
                )

                # Now, if the score is high enough, highlight it. Otherwise, underline.
                if h["score"] >= strong_score:
                    rendered.append(highlight_html_fn(safe_html))
                else:
                    rendered.append(underline_html_fn(safe_html))
            else:
                # Non-relevant sentences remain plain (escaped) text
                rendered.append(escape(sentences[gi]))

        # Output the score (here, the fused/re-ranked score) in a nice header, just for diagnostics
        header = f"Score {h['score']:.3f} — chunk {pi}"
        blocks.append(f"<h4>{escape(header)}</h4>")

        # Output a pretty version of the relevant paragraph
        blocks.append(
            "<div style='margin-left:2em;padding-left:0.75em;"
            "border-left:3px solid #ddd;line-height:1.6;font-size:0.95em;'>"
            f"{' '.join(rendered)}</div><hr>"
        )

        # Continue to count and output results until max_results
        shown += 1
        if shown >= max_results:
            break

    return "".join(blocks)
