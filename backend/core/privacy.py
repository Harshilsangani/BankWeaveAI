"""Sanitize questions while retaining explicit monetary filters."""

import re


def sanitize(query):
    # Preserve explicitly named monetary filters, while masking identifiers elsewhere.
    amounts = []

    def hold_amount(match):
        amounts.append(match[0])
        return f"[monetary-filter-{chr(65 + len(amounts) - 1)}]"

    value = re.sub(
        r"(?:above|over|greater than)\s*[₹$]?\s*[\d,.]+\s*(?:lakh|lac|crore|cr|k)?",
        hold_amount,
        query,
        flags=re.I,
    )
    value = re.sub(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}", "[email removed]", value)
    value = re.sub(r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", "[PAN removed]", value, flags=re.I)
    value = re.sub(r"\b(?:\d[ -]?){10,19}\b", "[identifier removed]", value)
    for index, amount in enumerate(amounts):
        value = value.replace(f"[monetary-filter-{chr(65 + index)}]", amount)
    return value
