"""Versioned, explicitly generated campaign inputs linked to existing Meridian IDs.

Only the explicit generator/import command writes these fixtures. Normal startup
and campaign jobs never reseed original banking records.
"""

import hashlib
import json
import random
from collections import defaultdict
from datetime import date, timedelta

from backend.core.database import connect, metadata
from backend.core.identifiers import now

GENERATOR = "card-campaign-fixture-v2"
TENANT = "meridian-demo"
RULES_VERSION = "card-prospect-demo-v1"
TEMPLATE_VERSION = "card-outreach-draft-v1"


def encode(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()


def cutoff_for(period):
    try:
        first = date.fromisoformat(period + "-01")
    except (TypeError, ValueError) as error:
        raise ValueError("Choose a campaign month in YYYY-MM format.") from error
    return (first - timedelta(days=1)).isoformat()


def months_before(cutoff, count=12):
    year, month = map(int, cutoff[:7].split("-"))
    end = year * 12 + month - 1
    return [
        f"{value // 12:04}-{value % 12 + 1:02}"
        for value in range(end - count + 1, end + 1)
    ]


def default_products():
    common = dict(
        version="demo-v1",
        currency="INR",
        rulesVersion=RULES_VERSION,
        disclosure="Fictional demonstration offer. Subject to separate application, bank checks and customer consent. This is not a pre-approved card.",
        feeConditions="No fee waiver is assumed. Review the fictional product terms before discussing an offer.",
    )
    return [
        dict(
            **common,
            id="CARD-TRAVEL",
            name="Meridian Travel Rewards",
            category="travel",
            annualFeeMinor=149900,
            benefits={
                "travel_rewards": "Reward points on eligible travel purchases.",
                "lounge": "Airport lounge access subject to program conditions.",
            },
            rules=dict(
                minScore=720,
                minIncomeMinor=4500000,
                maxDebtRatioBps=4500,
                minCategoryShareBps=1500,
                category="Travel",
                collateralMinor=0,
            ),
        ),
        dict(
            **common,
            id="CARD-CASHBACK",
            name="Meridian Shopping Cashback",
            category="cashback",
            annualFeeMinor=49900,
            benefits={
                "shopping_rewards": "Cashback on eligible shopping purchases.",
                "everyday": "Rewards on eligible everyday purchases.",
            },
            rules=dict(
                minScore=650,
                minIncomeMinor=2500000,
                maxDebtRatioBps=4500,
                minCategoryShareBps=1500,
                category="Shopping",
                collateralMinor=0,
            ),
        ),
        dict(
            **common,
            id="CARD-ENTRY",
            name="Meridian Secured Starter",
            category="entry",
            annualFeeMinor=0,
            benefits={
                "starter": "A starter card backed by a separately verified deposit.",
                "review": "A documented application and affordability review before issuance.",
            },
            rules=dict(
                minScore=None,
                minIncomeMinor=2000000,
                maxDebtRatioBps=5000,
                minCategoryShareBps=0,
                category="All",
                collateralMinor=2000000,
            ),
        ),
    ]


def generate_batch(cohort_size=5000, seed=2026, period="2026-10"):
    if not 1 <= cohort_size <= 10000:
        raise ValueError("Choose a cohort between one and 10,000 existing customers.")
    cutoff = cutoff_for(period)
    months = months_before(cutoff)
    meta = metadata("meridian")
    if cutoff[:7] != meta["periods"][-1]:
        raise ValueError(
            "The explicit fixture generator currently extends the latest completed Meridian snapshot only."
        )
    with connect() as db:
        db.execute("BEGIN")
        profiles = [
            dict(row)
            for row in db.execute("""SELECT m.id,m.branch_id,m.credit_score,p.full_name,p.date_of_birth,p.email,
          (SELECT MIN(a.id) FROM accounts a WHERE a.dataset=m.dataset AND a.customer_id=m.id) account_id
          FROM customer_master m JOIN customer_profiles p ON p.id=m.id AND p.dataset=m.dataset
          WHERE m.dataset='meridian' ORDER BY m.id""")
        ]
        buckets = defaultdict(list)
        for row in profiles:
            buckets[row["branch_id"]].append(row)
        ordered = []
        for branch in sorted(buckets):
            buckets[branch].sort(key=lambda row: digest([seed, row["id"]]))
        while any(buckets.values()):
            for branch in sorted(buckets):
                if buckets[branch]:
                    ordered.append(buckets[branch].pop())
        cohort = sorted(ordered[:cohort_size], key=lambda row: row["id"])
        if len(cohort) != cohort_size or any(not row["account_id"] for row in cohort):
            raise ValueError(
                "Existing identities/accounts do not support the requested linked cohort."
            )
        ids = {row["id"] for row in cohort}
        monthly = defaultdict(dict)
        daily = defaultdict(dict)
        source_rows = []
        for row in db.execute(
            """SELECT customer_id,substr(occurred_on,1,7) period,category,direction,
            SUM(amount_minor) amount,COUNT(*) records FROM cashflow_events
            WHERE dataset='meridian' AND occurred_on<=? GROUP BY customer_id,period,category,direction
            ORDER BY customer_id,period,category,direction""",
            (cutoff,),
        ):
            if row["customer_id"] not in ids:
                continue
            source_rows.append(dict(row))
            month = monthly[row["customer_id"]].setdefault(
                row["period"], dict(income=0, categories={}, records=0)
            )
            month["records"] += row["records"]
            if row["direction"] == "inflow":
                month["income"] += row["amount"]
            else:
                month["categories"][row["category"]] = row["amount"]
        for row in db.execute(
            "SELECT customer_id,occurred_on,SUM(CASE WHEN direction='inflow' THEN amount_minor ELSE -amount_minor END) net FROM cashflow_events WHERE dataset='meridian' AND occurred_on<=? GROUP BY customer_id,occurred_on",
            (cutoff,),
        ):
            if row["customer_id"] in ids:
                daily[row["customer_id"]][row["occurred_on"]] = row["net"]
        obligations = {}
        for row in db.execute(
            """SELECT l.customer_id,COALESCE(SUM(i.principal_due_minor),0)/6 monthly_principal,
            COALESCE(SUM(CASE WHEN i.due_on<=? THEN MAX(0,i.principal_due_minor-COALESCE((SELECT SUM(p.principal_paid_minor) FROM loan_payments p WHERE p.dataset=i.dataset AND p.installment_id=i.id AND p.paid_on<=?),0)) ELSE 0 END),0) overdue,
            COUNT(i.id) observed FROM loans l LEFT JOIN loan_installments i ON i.dataset=l.dataset AND i.loan_id=l.id AND i.due_on<=?
            WHERE l.dataset='meridian' GROUP BY l.customer_id""",
            (cutoff, cutoff, cutoff),
        ):
            obligations[row["customer_id"]] = dict(row)
        for row in db.execute(
            """SELECT l.customer_id,p.paid_on,SUM(p.principal_paid_minor) amount FROM loan_payments p
            JOIN loan_installments i ON i.dataset=p.dataset AND i.id=p.installment_id
            JOIN loans l ON l.dataset=i.dataset AND l.id=i.loan_id WHERE l.dataset='meridian' AND p.paid_on<=?
            GROUP BY l.customer_id,p.paid_on""",
            (cutoff,),
        ):
            if row["customer_id"] in ids:
                daily[row["customer_id"]][row["paid_on"]] = (
                    daily[row["customer_id"]].get(row["paid_on"], 0) - row["amount"]
                )
        openings = {
            row["customer_id"]: row["amount_minor"]
            for row in db.execute(
                "SELECT * FROM cashflow_opening_balances WHERE dataset='meridian' AND as_of<=?",
                (cutoff,),
            )
        }
    source_hash = digest(
        dict(
            cohort=cohort,
            monthly=source_rows,
            obligations={
                key: value for key, value in obligations.items() if key in ids
            },
            daily={key: value for key, value in daily.items() if key in ids},
            openings={key: value for key, value in openings.items() if key in ids},
        )
    )
    manifest = dict(
        generatorVersion=GENERATOR,
        seed=seed,
        datasetId="meridian",
        currency="INR",
        cohort=[row["id"] for row in cohort],
        sourceHash=source_hash,
        cutoff=cutoff,
        windowStart=months[0] + "-01",
        windowEnd=cutoff,
        reusedPeriods=meta["periods"],
        generatedPeriods=[month for month in months if month not in meta["periods"]],
        source="Reused labeled synthetic observations plus campaign-only historical extensions",
        availability="Availability dates in generated evidence are simulated business dates; created_at records actual generation time.",
    )
    batch_hash = digest(manifest)
    batch_id = "CBATCH-" + batch_hash[:24]
    with connect() as db:
        existing = db.execute(
            "SELECT manifest FROM campaign_input_batches WHERE id=?", (batch_id,)
        ).fetchone()
        if existing:
            return dict(
                id=batch_id, replayed=True, manifest=json.loads(existing["manifest"])
            )
    credit, observations, holdings, consent = [], [], [], []
    for index, profile in enumerate(cohort):
        customer = profile["id"]
        rng = random.Random(digest([seed, customer]))
        base = monthly[customer]
        salary = [entry["income"] for entry in base.values() if entry["income"] > 0]
        average_income = sum(salary) // len(salary) if salary else 0
        debt = obligations.get(
            customer, dict(monthly_principal=0, overdue=0, observed=0)
        )
        # Extra obligation components are invented explicitly; principal is reused, not counted twice.
        interest = debt["monthly_principal"] // 5
        outside = average_income * rng.randrange(3, 12) // 100
        total_debt = debt["monthly_principal"] + interest + outside
        complete = index % 43 != 0 and (
            not debt["monthly_principal"] or debt["observed"] > 0
        )
        thin = index % 41 == 0
        score = None if thin or index % 37 == 0 else profile["credit_score"]
        collateral = (25000 + index % 10 * 1000) * 100 if thin or index % 4 == 0 else 0
        balance = openings.get(customer, 0)
        balances = []
        day = date(2026, 4, 1)
        while day.isoformat() <= cutoff:
            balance += daily[customer].get(day.isoformat(), 0)
            balances.append(balance)
            day += timedelta(days=1)
        facts = dict(
            monthly=base,
            birthDate=profile["date_of_birth"],
            displayName=profile["full_name"],
            thinFile=thin,
            principalObligationMinor=debt["monthly_principal"],
            interestMinor=interest,
            outsideObligationMinor=outside,
            overduePrincipalMinor=debt["overdue"],
            averageBalanceProxyMinor=sum(balances) // len(balances)
            if balances
            else None,
            contactValid=re_email(profile["email"]) and index % 47 != 0,
            source="Synthetic score/collateral/interest/external obligations; existing generated payroll and principal ledger",
            sourceHash=source_hash,
            generatedFields=[
                "scoreSnapshotDate",
                "interest",
                "outsideObligations",
                "collateral",
                "holdingsCoverage",
                "emailConsent",
            ],
        )
        credit.append(
            (
                batch_id,
                "meridian",
                customer,
                cutoff,
                cutoff,
                score,
                total_debt if complete else None,
                int(complete),
                int(index % 29 != 0),
                collateral,
                encode(facts),
                digest(facts),
            )
        )
        for month in manifest["generatedPeriods"]:
            income = average_income * (100 + rng.randrange(-3, 4)) // 100
            distribution = ([65, 20, 15], [15, 65, 20], [15, 25, 60])[index % 3]
            spend = max(0, income - total_debt)
            entries = [
                ("inflow", "Synthetic payroll", income),
                ("outflow", "Travel", spend * distribution[0] // 100),
                ("outflow", "Retail", spend * distribution[1] // 100),
                (
                    "outflow",
                    "Groceries",
                    spend
                    - spend * distribution[0] // 100
                    - spend * distribution[1] // 100,
                ),
                ("outflow", "Synthetic debt obligations", min(total_debt, income)),
            ]
            for n, (direction, category, amount) in enumerate(entries):
                event = f"{customer}-{month}-{n}"
                occurred = month + (
                    "-01" if direction == "inflow" else f"-{5 + n * 4:02}"
                )
                observations.append(
                    (
                        batch_id,
                        event,
                        "meridian",
                        customer,
                        profile["account_id"],
                        occurred,
                        occurred,
                        direction,
                        category,
                        "Generated",
                        amount,
                        "INR",
                        "Campaign-only synthetic extension; not an original bank transaction",
                    )
                )
        if index % 13 == 0:
            product = default_products()[index % 3]["id"]
            holdings.append(
                (
                    batch_id,
                    "meridian",
                    customer,
                    product,
                    months[0] + "-01",
                    months[0] + "-01",
                    None,
                    "Generated existing-card fixture",
                )
            )
        if index % 5 != 0:
            consent.append(
                (
                    "CONSENT-" + digest([batch_id, customer, "grant"])[:24],
                    TENANT,
                    "meridian",
                    customer,
                    batch_id,
                    "email",
                    "credit_card_offers",
                    "granted",
                    months[0] + "-01",
                    months[0] + "-01",
                    "Explicitly generated email-marketing permission; not actual customer consent",
                    "synthetic-generator",
                    now(),
                )
            )
        if index % 17 == 0:
            action = "withdrawn" if index % 2 else "suppressed"
            consent.append(
                (
                    "CONSENT-" + digest([batch_id, customer, action])[:24],
                    TENANT,
                    "meridian",
                    customer,
                    batch_id,
                    "email",
                    "credit_card_offers",
                    action,
                    cutoff,
                    cutoff,
                    "Generated withdrawal/suppression edge case",
                    "synthetic-generator",
                    now(),
                )
            )
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        if db.execute(
            "SELECT 1 FROM campaign_input_batches WHERE id=?", (batch_id,)
        ).fetchone():
            return dict(id=batch_id, replayed=True, manifest=manifest)
        manifest["recordHashes"] = dict(
            credit=digest(credit),
            observations=digest(sorted(observations, key=lambda row: row[1])),
            holdings=digest(holdings),
            consent=digest(
                [row[:-1] for row in sorted(consent, key=lambda row: row[0])]
            ),
        )
        batch_hash = digest(manifest)
        db.execute(
            "INSERT INTO campaign_input_batches VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                batch_id,
                TENANT,
                "meridian",
                GENERATOR,
                seed,
                cutoff,
                months[0] + "-01",
                cutoff,
                cohort_size,
                encode(manifest),
                batch_hash,
                "ready",
                now(),
            ),
        )
        db.executemany(
            "INSERT INTO campaign_credit_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            credit,
        )
        db.executemany(
            "INSERT INTO campaign_spending_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            observations,
        )
        db.executemany(
            "INSERT INTO customer_card_holdings VALUES(?,?,?,?,?,?,?,?)", holdings
        )
        db.executemany(
            "INSERT INTO marketing_consent_events VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            consent,
        )
        for product in default_products():
            db.execute(
                "INSERT OR IGNORE INTO card_product_versions VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                (
                    product["id"],
                    product["version"],
                    TENANT,
                    product["name"],
                    product["category"],
                    months[0] + "-01",
                    None,
                    encode(product),
                    encode(product["rules"]),
                    "active",
                    digest(product),
                ),
            )
    return dict(
        id=batch_id,
        replayed=False,
        manifest=manifest,
        counts=dict(
            customers=cohort_size,
            extensionObservations=len(observations),
            consentEvents=len(consent),
            holdings=len(holdings),
        ),
    )


def re_email(value):
    import re

    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value or ""))


def readiness(dataset="meridian", period="2026-10", tenant=TENANT):
    cutoff = cutoff_for(period)
    if dataset != "meridian":
        return dict(
            ready=False,
            datasetId=dataset,
            period=period,
            cutoff=cutoff,
            reason="BankShield has incomplete customer joins and no coherent lending/cashflow history for card campaigns.",
            batch=None,
        )
    with connect() as db:
        row = db.execute(
            "SELECT * FROM campaign_input_batches WHERE tenant=? AND dataset=? AND cutoff=? AND status='ready' ORDER BY created_at DESC,id LIMIT 1",
            (tenant, dataset, cutoff),
        ).fetchone()
        if row:
            count = db.execute(
                "SELECT COUNT(*) FROM campaign_credit_profiles WHERE batch_id=?",
                (row["id"],),
            ).fetchone()[0]
            linked = db.execute(
                """SELECT COUNT(*) FROM campaign_credit_profiles p JOIN customers c ON c.dataset=p.dataset AND c.id=p.customer_id WHERE p.batch_id=?""",
                (row["id"],),
            ).fetchone()[0]
            ready = count == row["cohort_size"] == linked
            manifest = json.loads(row["manifest"])
            return dict(
                ready=ready,
                datasetId=dataset,
                period=period,
                cutoff=cutoff,
                reason="Versioned campaign data ready."
                if ready
                else "The campaign batch has missing customer/credit links.",
                batch=dict(
                    id=row["id"],
                    cohortSize=row["cohort_size"],
                    windowStart=row["window_start"],
                    windowEnd=row["window_end"],
                    manifestHash=row["manifest_hash"],
                    reusedPeriods=manifest["reusedPeriods"],
                    generatedPeriods=manifest["generatedPeriods"],
                    generatorVersion=row["generator_version"],
                ),
                limitations=[
                    "All data and products are synthetic demo observations.",
                    "Existing repayment data records principal only; missing obligation components are generated separately.",
                    "Email-marketing permission is separate from declared-needs consent.",
                ],
            )
    return dict(
        ready=False,
        datasetId=dataset,
        period=period,
        cutoff=cutoff,
        reason="No published campaign input batch covers this cutoff. Generate/import a versioned batch explicitly; existing historical data is not automatically rolled forward.",
        batch=None,
    )
