"""Command Center uses the same tools and source snapshots as the analyst."""

import json

from backend.core.database import connect, metadata
from backend.core.formatting import period_label
from backend.features.analytics.queries import aggregate, build


def radar(dataset="meridian", period=None):
    from backend.features.risk.detection import run

    return run(dataset, period)["events"]


def dashboard(dataset="meridian", period=None):
    period = period or metadata(dataset)["periods"][-1]
    scope = dict(
        datasetId=dataset,
        period=period,
        domain="fraud",
        riskId="BS-001" if dataset == "bankshield" else "RSK-001",
    )
    data = build(scope)
    with connect() as db:
        customers = db.execute(
            "SELECT COUNT(*) FROM customers WHERE dataset=?", (dataset,)
        ).fetchone()[0]
        history = db.execute(
            "SELECT payload FROM artifacts WHERE kind='investigation' ORDER BY created_at DESC LIMIT 50"
        ).fetchall()
    recent = []
    from backend.features.workspaces.sessions import session_key

    sid = session_key.get()
    for row in history:
        inv = json.loads(row[0])
        with connect() as db:
            if (
                sid
                and not db.execute(
                    "SELECT 1 FROM session_artifacts WHERE session_id=? AND artifact_id=?",
                    (sid, inv["id"]),
                ).fetchone()
            ):
                continue
            case = db.execute(
                "SELECT status FROM investigation_cases WHERE investigation_id=?",
                (inv["id"],),
            ).fetchone()
        if inv["scope"]["datasetId"] == dataset and inv["scope"]["period"] == period:
            recent.append(
                dict(
                    id=inv["risk"]["id"],
                    investigationId=inv["id"],
                    title=inv["title"],
                    category=inv["risk"]["category"],
                    status=case[0] if case else inv["status"],
                    time=inv["createdAt"][:10],
                )
            )
        if len(recent) == 3:
            break
    metrics = [
        dict(
            label="Transactions monitored",
            value=f"{data['current']['total']:,}",
            change="Historical snapshot",
            direction="neutral",
            detail=period_label(period),
        ),
        *data["metrics"][:2],
    ]
    if dataset == "meridian":
        loans = aggregate({**scope, "domain": "loans", "riskId": "RSK-002"})
        metrics.append(
            dict(
                label="Loan default rate",
                value=f"{loans['rate']:.2f}%",
                change=f"{loans['affected']} defaults",
                direction="neutral",
                detail=f"{loans['total']} loans · same snapshot",
            )
        )
    else:
        metrics.append(
            dict(
                label="Source customers",
                value=f"{customers:,}",
                change="Sample coverage",
                direction="neutral",
                detail="Incomplete transaction/customer joins",
            )
        )
    return dict(
        metrics=metrics,
        trend=data["trend"],
        regions=data["regions"],
        risks=radar(dataset, period),
        recent=recent,
        snapshot=period_label(period),
        customerCount=customers,
        datasetId=dataset,
        period=period,
    )
