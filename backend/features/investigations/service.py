"""Build a frozen investigation from recorded database evidence."""

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.features.analytics.queries import analysis_metadata, build, risk
from backend.features.workspaces.artifacts import persist


def investigate(scope):
    from backend.core.security import require

    require("analyze")
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        data = build(scope)
        from backend.features.investigations.review import (
            SOURCE_VERSION,
            source_snapshot,
        )

        digest, source_counts = source_snapshot(db, scope)
        from backend.core.progress import emit

        emit("Evidence assembled")
        result = dict(
            id=identifier("INV"),
            title=risk(scope, data)["title"],
            risk=risk(scope, data),
            scope=scope,
            createdAt=now(),
            status="In review",
            metrics=data["metrics"],
            trend=data["trend"],
            segments=data["segments"],
            evidence=data["evidence"],
            findings=data["findings"],
            actions=[
                "Review available transaction references and alternative explanations.",
                "Obtain complete parent records before customer-level escalation."
                if scope["datasetId"] == "bankshield"
                else "Validate device and merchant context with an authorized human reviewer.",
                "No account restriction or payment action is executed by this workspace.",
            ],
            timeline=[
                dict(
                    time=now(),
                    title=stage,
                    detail="Recorded during this local analysis run.",
                )
                for stage in [
                    "Scope validated",
                    "Source aggregates computed",
                    "Evidence attached",
                    "Ready for human review",
                ]
            ],
        )
        result["analysis"] = analysis_metadata(scope, result["id"])
        result["sourceSnapshot"] = dict(
            version=SOURCE_VERSION,
            inputHash=digest,
            sourceCounts=source_counts,
            capturedAt=now(),
        )
        result["execution"] = dict(method="Database evidence", modelCalls=0)
        if scope.get("riskId") == "RSK-003":
            result["title"] = result["risk"]["title"] = (
                "Ahmedabad flagged new-device activity"
            )
        if scope.get("domain") != "loans":
            from backend.features.investigations.relationships import (
                build as relationship_graph,
            )

            result["relationshipGraph"] = relationship_graph(scope)
            graph = result["relationshipGraph"]
            if graph["available"]:
                result["evidence"].append(
                    dict(
                        id="GRAPH-" + graph["snapshotHash"][:12],
                        title="Observed customer/device relationships",
                        source=graph["version"],
                        detail=f"{graph['sampledTransactions']} sampled flagged transactions out of {graph['totalFlaggedTransactions']}. Links are observations, not proof of collusion.",
                        records=[
                            edge["relation"]
                            + ": "
                            + edge["source"]
                            + " → "
                            + edge["target"]
                            for edge in graph["edges"][:12]
                        ],
                    )
                )
        if scope.get("domain") == "loans":
            result["actions"] = [
                "Review the linked loan references with an authorized credit analyst.",
                "Obtain repayment and outstanding-balance evidence before a credit decision.",
                "No loan restriction or collection action is executed by this workspace.",
            ]
        if scope.get("riskId") == "RSK-004":
            from backend.features.knowledge.service import search

            result["repaymentEvidence"] = data["repaymentEvidence"]
            result["analysis"]["baseline"] = "Not required for the overdue threshold"
            result["analysis"]["limitations"] = [
                *result["analysis"]["limitations"],
                *data["limitations"],
                "Related policy excerpts are frozen reference guidance. Banking source checks do not track later policy-library revisions.",
            ]
            result["policyGuidance"] = dict(
                query="credit risk monitoring",
                sections=search("credit risk monitoring", limit=3)["results"],
                limitation="These supplied reference sections do not define the overdue thresholds or authorize collections. The detector uses published demonstration criteria.",
            )
            result["actions"] = [
                "Reconcile the saved due dates and linked payment IDs at the stated cutoff, including partial payments.",
                "Check incomplete schedules, corrections and any authorized payment evidence before escalation.",
                "Review the supplied policy references and record their limitations; obtain an applicable overdue policy if needed.",
                "Record the checks, conclusion and follow-up owner. No credit or collection action is performed automatically.",
            ]
    persist("investigation", result, scope)
    return result
