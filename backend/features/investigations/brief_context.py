"""Bounded saved facts and review options; never project individual source rows."""

import hashlib
import json

from backend.integrations.ai.contracts import CaseReviewSelection

PROMPT_VERSION = "case-review-selection-v1"


def context(inv):
    observations = [
        dict(id="snapshot-summary", label="Saved signal", text=inv["risk"]["summary"])
    ]
    observations.extend(
        dict(id=f"finding-{index}", label=f"Saved finding {index}", text=text)
        for index, text in enumerate(inv.get("findings", [])[:3], 1)
    )
    observations.extend(
        dict(
            id=f"metric-{index}",
            label=metric["label"],
            text=f"{metric['label']}: {metric['value']}. {metric.get('detail', '')}",
        )
        for index, metric in enumerate(inv.get("metrics", [])[:4], 1)
    )
    limitations = (inv.get("analysis") or {}).get("limitations", [])[:12]
    gaps = [
        dict(id=f"gap-{index}", label=f"Source limitation {index}", text=text)
        for index, text in enumerate(limitations, 1)
    ]
    gaps.extend(
        [
            dict(
                id="gap-snapshot",
                label="Snapshot boundary",
                text="This brief uses the saved case snapshot. Current records may differ; no live rows were used to prepare it.",
            ),
            dict(
                id="gap-decision",
                label="Human verification required",
                text="Synthetic flags and default markers are observations, not confirmed fraud, financial loss or a final credit decision.",
            ),
        ]
    )
    loans = inv["scope"].get("domain") == "loans"
    overdue = inv["scope"].get("riskId") == "RSK-004"
    if overdue:
        for index, section in enumerate(
            inv.get("policyGuidance", {}).get("sections", [])[:2], 1
        ):
            observations.append(
                dict(
                    id=f"policy-{index}",
                    label="Saved policy reference",
                    text=f"{section['title']} ({section['version']}), {section['section']}: {section['text']}",
                )
            )
        gaps.append(
            dict(
                id="gap-policy",
                label="Policy boundary",
                text=inv.get("policyGuidance", {}).get(
                    "limitation", "No applicable overdue policy was supplied."
                ),
            )
        )
    bankshield = inv["scope"]["datasetId"] == "bankshield"
    refs = [observations[0]["id"], "gap-decision"]
    hypotheses = []
    if bankshield:
        hypotheses.append(
            dict(
                id="hypothesis-coverage",
                label="Incomplete links",
                text="Incomplete parent links could affect which customer relationships are visible. This does not by itself explain the supplied transaction labels.",
                references=["finding-1", "gap-snapshot"],
            )
        )
    hypotheses.extend(
        [
            dict(
                id="hypothesis-mix",
                label="Loan mix" if loans else "Transaction mix",
                text="A different mix of loans or regional coverage could contribute to the recorded change. Compare like-for-like loan cohorts before drawing a conclusion."
                if loans
                else "A different mix of transaction channels or regions could contribute to the recorded change. Compare like-for-like populations before drawing a conclusion.",
                references=refs,
            ),
            dict(
                id="hypothesis-reporting",
                label="Reporting changes",
                text="Payment timing or reporting updates could contribute to recorded loan markers. Repayment and outstanding-balance evidence is needed to test this possibility."
                if loans
                else "Source labeling or reporting changes could contribute to the recorded pattern. Validate source definitions before attributing the change to customer behavior.",
                references=refs,
            ),
        ]
    )
    checks = [
        dict(
            id="check-source",
            text="Check source coverage, missing parents and the reporting period before escalating this case.",
            references=[gap["id"] for gap in gaps],
        ),
        dict(
            id="check-reconcile",
            text="Reconcile the saved signal and counts against the authorized source evidence using the same scope and baseline.",
            references=[item["id"] for item in observations],
        ),
        dict(
            id="check-context",
            text="Obtain repayment and outstanding-balance evidence from an authorized reviewer before a credit decision."
            if loans
            else "Ask an authorized reviewer to check transaction context and alternative explanations. Do not infer a customer-linked ring from incomplete joins.",
            references=[item["id"] for item in hypotheses],
        ),
        dict(
            id="check-record",
            text="Record what was actually checked, any remaining evidence gaps and the follow-up owner before changing the case status.",
            references=["gap-decision", "gap-snapshot"],
        ),
    ]
    if overdue:
        hypotheses[0].update(
            label="Coverage and loan mix",
            text="Loan mix and incomplete repayment coverage could affect the observed review population. Reconcile the selected loans and missing observations before comparing cohorts.",
        )
        hypotheses[1].update(
            label="Payment allocation and cutoff",
            text="Unrecorded payments, allocation corrections or source timing could change the observed unpaid principal. Verify these possibilities against authorized repayment evidence; they are not established explanations.",
        )
        checks[2].update(
            text="Verify due dates, partial-payment allocation and payments dated at the saved cutoff. Do not treat a later settlement as a payment available before that cutoff."
        )
        checks[1].update(
            text="Reconcile qualifying loan counts and unpaid principal against the saved due/payment references at the stated month-end cutoff. A growth baseline is not required for this signal."
        )
        checks.insert(
            2,
            dict(
                id="check-policy",
                text="Review the frozen policy excerpts and obtain the applicable overdue procedure where coverage is missing. The demo detector thresholds are not policy requirements.",
                references=[
                    "gap-policy",
                    *[
                        item["id"]
                        for item in observations
                        if item["id"].startswith("policy-")
                    ],
                ],
            ),
        )
    # A legacy snapshot may have no findings; references must still resolve.
    allowed = {item["id"] for item in observations + gaps + hypotheses}
    for item in hypotheses + checks:
        item["references"] = [ref for ref in item["references"] if ref in allowed]
    return dict(
        dataset=inv["scope"]["datasetId"],
        domain="loans" if loans else "fraud",
        observations=observations,
        gaps=gaps,
        hypotheses=hypotheses,
        checks=checks,
    )


def binding(inv):
    encoded = json.dumps(inv, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    artifact_hash = hashlib.sha256(encoded.encode()).hexdigest()
    snapshot_hash = (inv.get("sourceSnapshot") or {}).get("inputHash") or artifact_hash
    key = hashlib.sha256(
        f"{inv['id']}\0{artifact_hash}\0{PROMPT_VERSION}".encode()
    ).hexdigest()
    return key, artifact_hash, snapshot_hash


def render_selection(selection, supplied):
    selection = CaseReviewSelection.model_validate(selection)
    result = {}
    for field, category in (
        ("observationIds", "observations"),
        ("hypothesisIds", "hypotheses"),
        ("checkIds", "checks"),
    ):
        ids = getattr(selection, field)
        options = {item["id"]: item for item in supplied[category]}
        if len(ids) != len(set(ids)) or any(value not in options for value in ids):
            raise ValueError("The review selection contains unsupported references.")
        result[category] = [options[value] for value in ids]
    if "check-source" not in selection.checkIds:
        raise ValueError("The review selection omitted the required coverage check.")
    if (
        supplied["dataset"] == "bankshield"
        and "hypothesis-coverage" not in selection.hypothesisIds
    ):
        raise ValueError("The review selection omitted the incomplete-link hypothesis.")
    result["gaps"] = supplied["gaps"]
    result["sources"] = [
        *supplied["observations"],
        *supplied["gaps"],
        *supplied["hypotheses"],
    ]
    result["draftNote"] = (
        "Draft for human review; no conclusion has been verified.\n\n"
        + "\n".join(item["text"] for item in result["observations"][:2])
        + "\n\nSuggested checks, not completed actions:\n"
        + "\n".join(item["text"] for item in result["checks"][:2])
        + "\n\nAdd what you actually checked and any remaining gaps before saving."
    )
    if len(result["draftNote"]) > 2000:
        raise ValueError("The saved snapshot is too large for a bounded review note.")
    return result
