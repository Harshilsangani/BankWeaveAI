"""Rank the current policy library locally; source text and citations stay exact."""

import math
import re
import unicodedata
from collections import Counter
from difflib import get_close_matches

METHOD = "banking-terms-bm25-v1"
# Explicit vocabulary expansion, not embeddings or a trained semantic model.
ALIASES = {
    "identitycheck": (
        "know your customer",
        "customer identification",
        "kyc",
        "identity",
        "identification",
    ),
    "suspicious": ("suspicious", "unusual", "odd", "suspicion"),
    "transaction": (
        "transactions",
        "transaction",
        "payments",
        "payment",
        "transfers",
        "transfer",
    ),
    "escalation": ("escalation", "escalate", "escalating", "refer", "referral"),
    "discrepancy": (
        "discrepancies",
        "discrepancy",
        "mismatches",
        "mismatch",
        "inconsistencies",
        "inconsistent",
    ),
    "evidence": ("evidence", "proof", "supporting documents"),
    "onboarding": ("account opening", "onboarding", "onboard"),
    "aml": ("anti money laundering", "money laundering", "aml"),
    "arrears": ("past due", "late payments", "missed payments", "overdue", "arrears"),
    "installment": (
        "installments",
        "installment",
        "instalments",
        "instalment",
        "emi",
        "emis",
    ),
    "credit": ("lending", "credit"),
    "concentration": ("concentration", "concentrated"),
    "restriction": (
        "restrictions",
        "restriction",
        "freeze",
        "freezing",
        "block",
        "blocking",
    ),
    "approval": (
        "approval",
        "approvals",
        "approve",
        "approves",
        "approved",
        "permission",
    ),
    "record": ("records", "record", "log", "logging"),
    "review": (
        "review",
        "reviewing",
        "reviews",
        "check",
        "checking",
        "verify",
        "verification",
    ),
}
STOP = set(
    """what is the for and a an of to in how does this policy policies procedure
    procedures documentation tell me about bank banking can could should would i we
    our you do when which with are be it on as by at from please need find show
    must my any there if have has who before after under help someone their them staff according supplied
    s get handle handling deal dealing steps according required requirements""".split()
)
REPLACEMENTS = sorted(
    ((alias, canonical) for canonical, aliases in ALIASES.items() for alias in aliases),
    key=lambda item: (-len(item[0]), item[0]),
)
PHRASES = re.compile(
    r"\b(?:" + "|".join(re.escape(a) for a, _ in REPLACEMENTS) + r")\b"
)
CANONICAL = dict(REPLACEMENTS)


def tokens(text):
    plain = unicodedata.normalize("NFKC", text).casefold()
    plain = " ".join(re.findall(r"[^\W_]+", plain, re.UNICODE))
    plain = PHRASES.sub(lambda match: CANONICAL[match[0]], plain)
    return [word for word in plain.split() if word not in STOP]


def rank(query, chunks, limit=6):
    """BM25 plus title/heading boosts and a conservative query-coverage gate."""
    query_terms = set(tokens(query[:2000]))
    if not query_terms or not chunks:
        return []
    indexed = []
    for chunk in chunks:
        title = set(
            tokens(chunk["title"] + " " + chunk["category"] + " " + chunk["documentId"])
        )
        heading = set(tokens(chunk["section"]))
        body = Counter(tokens(chunk["text"]))
        indexed.append((chunk, title, heading, body, title | heading | body.keys()))
    vocabulary = set().union(*(item[4] for item in indexed))
    corrections = {}
    for term in query_terms - vocabulary:
        # Avoid short-word guesses and ambiguous corrections such as loan/load.
        if len(term) >= 6:
            candidates = get_close_matches(term, sorted(vocabulary), n=2, cutoff=0.86)
            if len(candidates) == 1:
                corrections[term] = candidates[0]
    terms = {corrections.get(term, term) for term in query_terms}
    frequencies = {term: sum(term in item[4] for item in indexed) for term in terms}
    average = sum(sum(item[3].values()) for item in indexed) / len(indexed) or 1
    ranked = []
    for chunk, title, heading, body, all_terms in indexed:
        matched = terms & all_terms
        # Unknown topics must not become supported through one incidental word.
        if not matched or len(matched) / len(terms) < 0.6:
            continue
        length = sum(body.values())
        score = 0
        for term in matched:
            idf = math.log(
                1 + (len(indexed) - frequencies[term] + 0.5) / (frequencies[term] + 0.5)
            )
            tf = body[term]
            score += idf * (
                tf * 2.2 / (tf + 1.2 * (0.25 + 0.75 * length / average)) if tf else 0
            )
            score += idf * (1.4 * (term in title) + 1.8 * (term in heading))
        ranked.append(
            {**chunk, "score": round(score, 6), "matchedTerms": sorted(matched)}
        )
    return sorted(ranked, key=lambda item: (-item["score"], item["reference"]))[:limit]
