"""Reports HTTP endpoints; stable public paths and request contracts."""

from fastapi import APIRouter

from backend.api.common import scoped
from backend.api.schemas import ReportRequest, Scenario, Scope
from backend.core.database import connect
from backend.features.analytics.queries import aggregate
from backend.features.reports.service import make_report

router = APIRouter()


@router.post("/scenarios")
def scenario(body: Scenario):
    scope = scoped(body.scope)
    if scope["datasetId"] != "meridian" or scope["domain"] != "fraud":
        raise ValueError(
            "The authentication scenario is supported for Meridian fraud only."
        )
    scope["riskId"] = body.riskId
    if body.riskId == "RSK-003":
        scope.setdefault("region", "Ahmedabad")
        scope.setdefault("newDeviceOnly", True)
    a = aggregate(scope)
    reduction = a["exposure"] * body.coverage / 100 * body.effectiveness / 100
    challenged = round(a["affected"] * body.coverage / 100)
    return dict(
        input={**body.model_dump(exclude_none=True), "scope": scope},
        baseline=a["exposure"],
        projected=a["exposure"] - reduction,
        reduction=reduction,
        affected=a["affected"],
        challenged=challenged,
        abandoned=round(challenged * body.friction / 100),
        assumptions=[
            f"Illustrative model: coverage {body.coverage:g}%, assumed effectiveness {body.effectiveness:g}%, assumed abandonment {body.friction:g}%.",
            "Reduction = flagged transaction value × coverage × assumed effectiveness. Values are not predicted financial losses.",
            "Transactions are modeled independently. No bank control is executed.",
        ],
    )


@router.post("/reports")
def report(body: ReportRequest):
    if body.scenarioInput:
        with connect() as db:
            import json

            row = db.execute(
                "SELECT payload FROM artifacts WHERE id=? AND kind='investigation'",
                (body.investigationId,),
            ).fetchone()
        if not row:
            raise ValueError("Investigation not found.")
        inv = json.loads(row[0])
        if body.scenarioInput.riskId != inv["risk"]["id"]:
            raise ValueError("Scenario belongs to a different investigation scope.")
        input_value = body.scenarioInput.model_copy(
            update={"scope": Scope.model_validate(inv["scope"])}
        )
        return make_report(body.investigationId, scenario(input_value))
    return make_report(body.investigationId)
