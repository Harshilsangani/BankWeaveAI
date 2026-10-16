"""Deterministic prospect screening and matching for fictional card offers.

Unknown observations remain unknown. No result is a credit approval, and this
module never contacts a customer or changes a banking record.
"""

import json
from collections import defaultdict
from datetime import date

from backend.core.database import connect
from backend.features.campaigns.data import RULES_VERSION, TENANT, digest, encode


def products_at(db, cutoff, tenant=TENANT):
    rows = db.execute(
        "SELECT * FROM card_product_versions WHERE tenant=? AND status='active' AND effective_on<=? AND (expires_on IS NULL OR expires_on>=?) ORDER BY product_id,version",
        (tenant, cutoff, cutoff),
    ).fetchall()
    products = {}
    for row in rows:
        product = json.loads(row["catalog"])
        if digest(product) != row["content_hash"]:
            raise ValueError(
                "Product version checksum mismatch; restore the reviewed catalog version."
            )
        prior = products.get(row["product_id"])
        if not prior or product.get("publishedAt", "0000") >= prior.get(
            "publishedAt", "0000"
        ):
            products[row["product_id"]] = {
                **product,
                "contentHash": row["content_hash"],
            }
    return list(products.values())


def validate_batch(db, batch_id):
    row = db.execute(
        "SELECT * FROM campaign_input_batches WHERE id=?", (batch_id,)
    ).fetchone()
    if not row or row["status"] != "ready":
        raise ValueError("Select a published campaign input batch.")
    manifest = json.loads(row["manifest"])
    if digest(manifest) != row["manifest_hash"]:
        raise ValueError("Campaign manifest checksum mismatch.")
    hashes = manifest.get("recordHashes")
    if not hashes:
        raise ValueError(
            "This batch predates complete input checksums. Import a new generator version."
        )
    records = dict(
        credit=[
            tuple(item)
            for item in db.execute(
                "SELECT * FROM campaign_credit_profiles WHERE batch_id=? ORDER BY customer_id",
                (batch_id,),
            )
        ],
        observations=[
            tuple(item)
            for item in db.execute(
                "SELECT * FROM campaign_spending_observations WHERE batch_id=? ORDER BY id",
                (batch_id,),
            )
        ],
        holdings=[
            tuple(item)
            for item in db.execute(
                "SELECT * FROM customer_card_holdings WHERE batch_id=? ORDER BY customer_id,product_id",
                (batch_id,),
            )
        ],
        consent=[
            tuple(item)[:-1]
            for item in db.execute(
                "SELECT * FROM marketing_consent_events WHERE batch_id=? ORDER BY id",
                (batch_id,),
            )
        ],
    )
    if any(digest(items) != hashes[name] for name, items in records.items()):
        raise ValueError(
            "A published campaign input changed. Import a new batch rather than editing history."
        )
    profiles = db.execute(
        "SELECT * FROM campaign_credit_profiles WHERE batch_id=? ORDER BY customer_id",
        (batch_id,),
    ).fetchall()
    if [profile["customer_id"] for profile in profiles] != manifest["cohort"] or len(
        profiles
    ) != row["cohort_size"]:
        raise ValueError(
            "Campaign cohort/credit coverage does not match its published manifest."
        )
    for profile in profiles:
        if (
            digest(json.loads(profile["facts"])) != profile["source_hash"]
            or profile["effective_on"] > row["cutoff"]
            or profile["available_on"] > row["cutoff"]
        ):
            raise ValueError(
                "Campaign credit evidence is changed or outside the cutoff."
            )
    invalid = db.execute(
        """SELECT COUNT(*) FROM campaign_spending_observations o LEFT JOIN accounts a ON a.dataset=o.dataset AND a.id=o.account_id
      WHERE o.batch_id=? AND (a.id IS NULL OR a.customer_id!=o.customer_id OR o.occurred_on<? OR o.occurred_on>? OR o.available_on>? OR o.currency!='INR')""",
        (batch_id, row["window_start"], row["cutoff"], row["cutoff"]),
    ).fetchone()[0]
    if invalid:
        raise ValueError(
            "Campaign extension contains broken ownership, dates, or currency."
        )
    return dict(row), profiles


def build_features(batch_id):
    with connect() as db:
        batch, profiles = validate_batch(db, batch_id)
        extensions = defaultdict(dict)
        for row in db.execute(
            """SELECT customer_id,substr(occurred_on,1,7) period,direction,category,SUM(amount_minor) amount
          FROM campaign_spending_observations WHERE batch_id=? AND occurred_on<=? AND available_on<=?
          GROUP BY customer_id,period,direction,category""",
            (batch_id, batch["cutoff"], batch["cutoff"]),
        ):
            item = extensions[row["customer_id"]].setdefault(
                row["period"], dict(income=0, categories={})
            )
            if row["direction"] == "inflow":
                item["income"] += row["amount"]
            else:
                item["categories"][row["category"]] = row["amount"]
        holdings = defaultdict(list)
        for row in db.execute(
            """SELECT * FROM customer_card_holdings WHERE batch_id=? AND effective_on<=? AND available_on<=?
          AND (ended_on IS NULL OR ended_on>?)""",
            (batch_id, batch["cutoff"], batch["cutoff"], batch["cutoff"]),
        ):
            holdings[row["customer_id"]].append(row["product_id"])
    features = []
    for profile in profiles:
        facts = json.loads(profile["facts"])
        monthly = {**facts["monthly"], **extensions[profile["customer_id"]]}
        incomes = [
            item["income"]
            for period, item in monthly.items()
            if batch["window_start"][:7] <= period <= batch["cutoff"][:7]
        ]
        categories = defaultdict(int)
        for period, item in monthly.items():
            if not batch["window_start"][:7] <= period <= batch["cutoff"][:7]:
                continue
            for category, value in item["categories"].items():
                if category != "Synthetic debt obligations":
                    categories[category] += value
        average = sum(incomes) // len(incomes) if incomes else 0
        spending = sum(categories.values())
        shopping = categories["Retail"] + categories["Electronics"]
        shares = dict(
            Travel=categories["Travel"] * 10000 // spending if spending else 0,
            Shopping=shopping * 10000 // spending if spending else 0,
            All=10000,
        )
        cutoff = date.fromisoformat(batch["cutoff"])
        try:
            birth = date.fromisoformat(facts["birthDate"])
            age = (
                cutoff.year
                - birth.year
                - ((cutoff.month, cutoff.day) < (birth.month, birth.day))
            )
        except (TypeError, ValueError):
            age = None
        value = dict(
            customerId=profile["customer_id"],
            displayName=facts.get("displayName", "Customer"),
            batchId=batch_id,
            cutoff=batch["cutoff"],
            windowStart=batch["window_start"],
            score=profile["score"],
            thinFile=facts["thinFile"],
            age=age,
            incomeMonths=len(incomes),
            averageIncomeMinor=average,
            monthlyObligationMinor=profile["monthly_obligation_minor"],
            debtRatioBps=profile["monthly_obligation_minor"] * 10000 // average
            if profile["monthly_obligation_minor"] is not None and average > 0
            else None,
            obligationsComplete=bool(profile["obligations_complete"]),
            holdingsComplete=bool(profile["holdings_complete"]),
            heldProducts=sorted(holdings[profile["customer_id"]]),
            collateralMinor=profile["collateral_minor"],
            overduePrincipalMinor=facts["overduePrincipalMinor"],
            categorySpendMinor=dict(categories),
            categoryShareBps=shares,
            averageBalanceProxyMinor=facts["averageBalanceProxyMinor"],
            contactValid=facts["contactValid"],
            sourceHash=facts["sourceHash"],
            rulesVersion=RULES_VERSION,
            limitations=[
                "Generated demo credit/income/collateral observations; no verified bureau or affordability decision.",
                "Principal and generated extra obligations are separate; original source data remains intact.",
            ],
        )
        features.append(
            (
                batch_id,
                profile["customer_id"],
                batch["cutoff"],
                encode(value),
                digest(value),
            )
        )
    with connect() as db:
        db.executemany(
            "INSERT OR IGNORE INTO campaign_features VALUES(?,?,?,?,?)", features
        )
    return len(features)


def contact_permission(db, batch_id, customer_id, feature, as_of=None, tenant=TENANT):
    from datetime import datetime
    from zoneinfo import ZoneInfo

    as_of = as_of or datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    event = db.execute(
        """SELECT * FROM marketing_consent_events WHERE tenant=? AND dataset='meridian' AND customer_id=?
        AND (batch_id=? OR batch_id IS NULL) AND channel='email' AND purpose='credit_card_offers'
        AND effective_on<=? AND available_on<=? ORDER BY effective_on DESC,created_at DESC,id DESC LIMIT 1""",
        (tenant, customer_id, batch_id, as_of, as_of),
    ).fetchone()
    if not event:
        return "suppressed", "no_email_consent", None
    evidence = dict(
        eventId=event["id"],
        action=event["action"],
        effectiveOn=event["effective_on"],
        source=event["source"],
    )
    if event["action"] != "granted":
        return "suppressed", "email_" + event["action"], evidence
    from backend.features.campaigns.data import re_email

    profile = db.execute(
        "SELECT email FROM customer_profiles WHERE dataset='meridian' AND id=?",
        (customer_id,),
    ).fetchone()
    if not feature["contactValid"] or not profile or not re_email(profile["email"]):
        return "suppressed", "invalid_email", evidence
    return "allowed", "email_consent_recorded", evidence


def screen(feature, products):
    missing = []
    if feature["age"] is None:
        missing.append("missing_age_evidence")
    if feature["score"] is None and not feature["thinFile"]:
        missing.append("missing_credit_score")
    if feature["incomeMonths"] < 12 or not feature["averageIncomeMinor"]:
        missing.append("incomplete_income_history")
    if not feature["obligationsComplete"] or feature["debtRatioBps"] is None:
        missing.append("incomplete_obligations")
    if not feature["holdingsComplete"]:
        missing.append("unknown_card_holdings")
    if missing:
        return dict(
            status="insufficient_data",
            reason=missing[0],
            reasons=missing,
            product=None,
            alternatives=[],
        )
    if feature["age"] < 18:
        return dict(
            status="no_match",
            reason="demo_age_rule",
            reasons=["demo_age_rule"],
            product=None,
            alternatives=[],
        )
    if feature["overduePrincipalMinor"] > 0:
        return dict(
            status="no_match",
            reason="overdue_principal_review",
            reasons=["overdue_principal_review"],
            product=None,
            alternatives=[],
        )
    matches = []
    exclusions = []
    for product in products:
        rules = product["rules"]
        reasons = []
        if product["id"] in feature["heldProducts"]:
            reasons.append("matching_card_already_held")
        if rules["minScore"] is not None and (
            feature["score"] is None or feature["score"] < rules["minScore"]
        ):
            reasons.append("demo_score_below_rule")
        if feature["averageIncomeMinor"] < rules["minIncomeMinor"]:
            reasons.append("demo_income_below_rule")
        if feature["debtRatioBps"] > rules["maxDebtRatioBps"]:
            reasons.append("demo_debt_ratio_above_rule")
        if (
            feature["categoryShareBps"].get(rules["category"], 0)
            < rules["minCategoryShareBps"]
        ):
            reasons.append("no_category_fit")
        if feature["collateralMinor"] < rules["collateralMinor"]:
            reasons.append("missing_secured_deposit_evidence")
        if reasons:
            exclusions.extend(reasons)
            continue
        fit = (
            feature["categoryShareBps"].get(rules["category"], 0)
            if product["category"] != "entry"
            else -1
        )
        matches.append((fit, product))
    matches.sort(key=lambda pair: (-pair[0], pair[1]["annualFeeMinor"], pair[1]["id"]))
    if not matches:
        return dict(
            status="no_match",
            reason=exclusions[0] if exclusions else "no_active_product",
            reasons=sorted(set(exclusions)),
            product=None,
            alternatives=[],
        )
    return dict(
        status="prospect",
        reason="potential_demo_prospect",
        reasons=[
            "Complete labeled demo evidence",
            "Configured product rules met",
            f"{matches[0][1]['category'].title()} product fit",
        ],
        product=matches[0][1],
        alternatives=[pair[1]["id"] for pair in matches[1:]],
    )


def match_run(run_id, specification):
    with connect() as db:
        features = db.execute(
            "SELECT * FROM campaign_features WHERE batch_id=? AND cutoff=? ORDER BY customer_id",
            (specification["batchId"], specification["cutoff"]),
        ).fetchall()
        rows = []
        for row in features:
            feature = json.loads(row["payload"])
            if digest(feature) != row["input_hash"]:
                raise ValueError("Stored feature checksum mismatch.")
            result = screen(feature, specification["products"])
            status, reason, consent = (
                contact_permission(
                    db,
                    specification["batchId"],
                    row["customer_id"],
                    feature,
                    tenant=specification["tenant"],
                )
                if result["status"] == "prospect"
                else ("not_applicable", "not_a_prospect", None)
            )
            product = result["product"]
            evidence = dict(
                features=feature,
                reasons=result["reasons"],
                alternatives=result["alternatives"],
                consent=consent,
                productHash=product["contentHash"] if product else None,
            )
            rows.append(
                (
                    run_id,
                    row["customer_id"],
                    result["status"],
                    result["reason"],
                    product["id"] if product else None,
                    product["version"] if product else None,
                    status,
                    reason,
                    encode(evidence),
                )
            )
    with connect() as db:
        db.executemany(
            "INSERT OR IGNORE INTO campaign_candidates VALUES(?,?,?,?,?,?,?,?,?)", rows
        )
    return len(rows)
