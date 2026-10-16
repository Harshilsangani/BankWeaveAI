"""Validated analytical context and parameterized SQL filters."""

import calendar
import math
import re

from backend.core.database import connect, metadata
from backend.core.formatting import previous_period
from backend.features.datasets.demo_import import minor


def resolve(query, scope):
    result = dict(scope)
    meta = metadata(result.get("datasetId", "meridian"))
    result["datasetId"] = meta["id"]
    result["period"] = result.get("period") or meta["periods"][-1]
    q = query.lower()
    if re.search(r"\ball months\b|\bfull (?:history|period|dataset)\b|\ball time\b", q):
        result["period"] = "all"
    elif re.search(r"\blatest month\b", q) or (
        result["period"] == "all" and re.search(r"\bthis month\b", q)
    ):
        result["period"] = meta["periods"][-1]
    elif re.search(r"\blast month\b", q):
        result["period"] = previous_period(
            meta["periods"][-1] if result["period"] == "all" else result["period"]
        )
    domain = (
        "loans"
        if re.search(
            r"loan|default|secured|repay|installment|overdue|delinquen|outstanding", q
        )
        else "fraud"
        if re.search(r"fraud|transaction|card|device", q)
        else result.get("domain", "fraud")
    )
    if domain != result.get("domain", "fraud"):
        for key in ("riskId", "newDeviceOnly"):
            result.pop(key, None)
    result["domain"] = domain
    if re.search(r"all regions|all countries|reset|overall|portfolio", q):
        for key in ("region", "comparison", "minAmount", "newDeviceOnly"):
            result.pop(key, None)
    aliases = {
        "US": ["united states", "usa"],
        "GB": ["united kingdom", "uk"],
        "DE": ["germany"],
        "AE": ["uae"],
        "FR": ["france"],
        "ES": ["spain"],
        "NL": ["netherlands"],
        "IT": ["italy"],
        "CH": ["switzerland"],
        "SE": ["sweden"],
    }
    mentioned = [
        r
        for r in meta["regions"]
        if any(
            re.search(r"\b" + re.escape(a.lower()) + r"\b", q)
            for a in [r, *aliases.get(r, [])]
        )
    ]
    if mentioned:
        if "compare" in q and len(mentioned) == 1 and result.get("region"):
            result["comparison"] = mentioned[0]
        else:
            result["region"] = mentioned[0]
            result["comparison"] = (
                mentioned[1] if "compare" in q and len(mentioned) > 1 else None
            )
    date_match = re.search(r"\b(20\d{2})-(0[1-9]|1[0-2])\b", q)
    if date_match:
        result["period"] = date_match[0]
    else:
        for month in range(1, 13):
            match = re.search(
                r"\b" + calendar.month_name[month].lower() + r"\s+(20\d{2})\b", q
            )
            if match:
                result["period"] = f"{match[1]}-{month:02}"
    threshold = re.search(
        r"(?:above|over|greater than)\s*[₹$]?\s*([\d,.]+)\s*(lakh|lac|crore|cr|k)?", q
    )
    if threshold:
        result["minAmount"] = float(threshold[1].replace(",", "")) * {
            "lakh": 100000,
            "lac": 100000,
            "crore": 10000000,
            "cr": 10000000,
            "k": 1000,
        }.get(threshold[2], 1)
    if "new device" in q or "newly registered" in q:
        result["newDeviceOnly"] = True
    if meta["id"] == "meridian" and re.search(
        r"investigate.*cluster|largest cluster|investigate that segment", q
    ):
        result.update(region="Ahmedabad", newDeviceOnly=True, riskId="RSK-003")
    result["riskId"] = result.get("riskId") or (
        "BS-001"
        if meta["id"] == "bankshield"
        else "RSK-002"
        if domain == "loans"
        else "RSK-001"
    )
    validate_scope(result)
    return result


def validate_scope(scope):
    meta = metadata(scope.get("datasetId", "meridian"))
    if scope.get("customerId"):
        with connect() as db:
            if not db.execute(
                "SELECT 1 FROM customers WHERE dataset=? AND id=?",
                (meta["id"], scope["customerId"]),
            ).fetchone():
                raise ValueError(
                    "The customer is not available in the selected dataset."
                )
    minimum = scope.get("minAmount")
    if minimum is not None and (
        not math.isfinite(minimum) or not 0 <= minimum <= 1_000_000_000
    ):
        raise ValueError(
            "Choose a transaction amount threshold between 0 and 1 billion in the source currency."
        )
    if (
        scope.get("period")
        and scope["period"] != "all"
        and scope["period"] not in meta["periods"]
    ):
        raise ValueError(
            "The selected month is outside this dataset's reporting coverage."
        )
    for field in ("region", "comparison"):
        if scope.get(field) and scope[field] not in meta["regions"]:
            raise ValueError(
                "Choose a region or country available in the selected dataset."
            )
    if scope.get("datasetId") == "bankshield" and scope.get("riskId") not in (
        None,
        "BS-001",
    ):
        raise ValueError("This risk event does not belong to BankShield.")
    if scope.get("datasetId", "meridian") == "meridian" and scope.get("riskId") not in (
        None,
        "RSK-001",
        "RSK-002",
        "RSK-003",
    ):
        raise ValueError("Choose a supported Meridian risk event.")
    if scope.get("domain") == "loans" and scope.get("newDeviceOnly"):
        raise ValueError("A device filter cannot be applied to loan records.")


def condition(scope, period=None):
    selected = period or scope["period"]
    sql = "dataset=?"
    args = [scope.get("datasetId", "meridian")]
    if selected != "all":
        sql += " AND period=?"
        args.append(selected)
    if scope.get("region"):
        if scope.get("comparison"):
            sql += " AND region IN (?,?)"
            args.extend([scope["region"], scope["comparison"]])
        else:
            sql += " AND region=?"
            args.append(scope["region"])
    if scope.get("minAmount") is not None:
        sql += " AND amount_minor>?"
        args.append(minor(scope["minAmount"]))
    if scope.get("newDeviceOnly"):
        sql += " AND new_device=1"
    if scope.get("customerId"):
        sql += " AND account_id IN (SELECT id FROM accounts WHERE dataset=? AND customer_id=?)"
        args.extend([scope.get("datasetId", "meridian"), scope["customerId"]])
    return sql, args
