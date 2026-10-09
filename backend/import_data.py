"""Explicit, revision-pinned ingestion. Missing BankShield relations stay missing."""
import csv
import hashlib
import io
import json
import urllib.request
from collections import Counter
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from .database import STORAGE, connect, initialize

REVISION = "e9a38a97f05536cf300bff05d6b6dc833f3a0a8e"
SOURCE = "https://huggingface.co/datasets/Abdulmajeedyahya/BankShield-Enterprise-Grade-Multi-Pattern-Dataset"


def minor(value):
    return int((Decimal(str(value)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def boolean(value):
    normalized = str(value).strip().lower()
    if normalized in ("1", "true"):
        return 1
    if normalized in ("0", "false"):
        return 0
    raise ValueError("Invalid binary label in source data")


def valid_date(value):
    if not value or str(value).lower() in ("null", "nan", "none"):
        return None
    datetime.fromisoformat(value.replace("Z", "+00:00"))
    return value


def clear(db, dataset):
    for table in ("customers", "accounts", "transactions", "fraud_alerts", "fraud_outcomes", "devices", "device_events", "customer_master", "loans"):
        if table == "customers":
            db.execute("DELETE FROM customers WHERE dataset=? AND id NOT IN (SELECT id FROM customer_profiles WHERE dataset=?)", (dataset, dataset))
            continue
        db.execute(f"DELETE FROM {table} WHERE dataset=?", (dataset,))


def seed_meridian():
    raw = (STORAGE / "meridian.json").read_bytes()
    fixture = json.loads(raw)
    branches = {r["id"]: r["region"] for r in fixture["branches"]}
    customer_ids = {r["id"] for r in fixture["customers"]}
    accounts = {r["id"]: r for r in fixture["accounts"]}
    assert all(r["customerId"] in customer_ids for r in accounts.values())
    assert all(r["accountId"] in accounts and accounts[r["accountId"]]["customerId"] == r["customerId"] for r in fixture["transactions"])
    meta = dict(id="meridian", name="Meridian demo", currency="INR", version=hashlib.sha256(raw).hexdigest(),
                source="BankWeave deterministic synthetic fixture", sourceUrl=None, label="Flagged transactions",
                periods=[f"2026-{m:02}" for m in range(4, 10)], regions=list(branches.values()),
                limitations=["Synthetic detector flags are unconfirmed; value under review is not financial loss.",
                              "Device events and new-device markers are fixture-defined, not real bank telemetry."],
                coverage={"transactions": len(fixture["transactions"]), "customers": len(customer_ids),
                          "accounts": len(accounts), "alerts": len(fixture["fraudAlerts"]), "missingDates": 0,
                          "missingAccounts": 0, "missingAlertTransactions": 0, "completeCustomerChains": len(fixture["transactions"])})
    with connect() as db:
        clear(db, "meridian")
        db.executemany("INSERT OR IGNORE INTO customers VALUES(?,?)", [("meridian", r) for r in customer_ids])
        branch_map = {r["id"]: r for r in fixture["branches"]}
        db.executemany("INSERT INTO customer_master VALUES(?,?,?,?,?,?,?,?)", [("meridian", r["id"], r["branchId"], branch_map[r["branchId"]]["name"], branches[r["branchId"]], r["ageGroup"], r["occupation"], r["creditScore"]) for r in fixture["customers"]])
        # Enrich the existing 1,200 IDs; never replace edited profiles or add a second identity.
        db.executemany("INSERT OR IGNORE INTO customer_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [(r["id"], "meridian", r["fullName"], r["dateOfBirth"], r["email"], r["phone"], r["address"], r["city"], r["state"], r["postalCode"], "synthetic", None, "2026-04-01T00:00:00Z") for r in fixture["customers"]])
        assert all(r["customerId"] in customer_ids for r in fixture["loans"])
        db.executemany("INSERT INTO loans VALUES(?,?,?,?,?,?,?)", [("meridian", r["id"], r["customerId"], r["branchId"], r["type"], minor(r["amount"]), json.dumps(r["defaultMonths"])) for r in fixture["loans"]])
        db.executemany("INSERT INTO accounts VALUES(?,?,?,?)", [("meridian", r["id"], r["customerId"], None) for r in accounts.values()])
        db.executemany("INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [
            ("meridian", r["id"], r["accountId"], r["timestamp"], r["timestamp"][:7], minor(r["amount"]),
             branches[r["branchId"]], r["merchantCategory"], r["channel"], r["deviceId"], int(r["newDevice"]), int(r["flagged"]), r["riskScore"])
            for r in fixture["transactions"]])
        tx = {r["id"]: r for r in fixture["transactions"]}
        db.executemany("INSERT INTO fraud_alerts VALUES(?,?,?,?,?,?,?)", [("meridian", a["id"], a["transactionId"], tx[a["transactionId"]]["timestamp"], a["reason"], a["status"], tx[a["transactionId"]]["riskScore"]) for a in fixture["fraudAlerts"]])
        db.executemany("INSERT INTO fraud_outcomes VALUES(?,?,?,?,?)", [("meridian", a["transactionId"], "unreviewed", None, "No adjudication available") for a in fixture["fraudAlerts"]])
        db.executemany("INSERT INTO device_events VALUES(?,?,?,?)", [("meridian", r["id"], r["deviceId"], r["timestamp"]) for r in fixture["transactions"]])
        device_records = {}
        for transaction in fixture["transactions"]:
            entry = device_records.setdefault(transaction["deviceId"], {"customers": set(), "timestamps": []})
            entry["customers"].add(transaction["customerId"])
            entry["timestamps"].append(transaction["timestamp"])
        db.executemany("INSERT INTO devices VALUES(?,?,?,?,?)", [("meridian", device_id, next(iter(entry["customers"])) if len(entry["customers"]) == 1 else None, min(entry["timestamps"]), max(entry["timestamps"])) for device_id, entry in device_records.items()])
        db.execute("INSERT OR REPLACE INTO datasets VALUES(?,?)", ("meridian", json.dumps(meta)))
    from .knowledge import ingest,PolicyInput
    for policy in fixture.get('policies',[]):
        with connect() as db:
            exists=db.execute('SELECT 1 FROM policy_documents WHERE id=? AND version=?',(policy['id'],policy['version'])).fetchone()
        if not exists:
            ingest(PolicyInput(id=policy['id'],version=policy['version'],title=policy['title'],category=policy['category'],markdown='\n\n'.join(f'## Section {i+1}\n{text}' for i,text in enumerate(policy['sections']))))
    from .repayments import seed
    seed()
    from .insurance import seed as seed_insurance
    seed_insurance()
    from .recommendations import seed as seed_preferences
    seed_preferences()
    from .financial_health import seed as seed_cashflow
    seed_cashflow()


def seed_bankshield():
    directory = STORAGE / "bankshield" / REVISION
    directory.mkdir(parents=True, exist_ok=True)
    tables, hashes = {}, {}
    for name in ("customers", "accounts", "transactions", "fraud_alerts", "devices"):
        path = directory / f"{name}.csv"
        if not path.exists():
            request = urllib.request.Request(f"{SOURCE}/resolve/{REVISION}/{name}.csv", headers={"User-Agent": "BankWeave-local-demo"})
            with urllib.request.urlopen(request, timeout=45) as response:
                raw = response.read(20_000_001)
            if len(raw) > 20_000_000:
                raise ValueError("Source exceeds the bounded public-sample import limit")
            path.write_bytes(raw)
        raw = path.read_bytes()
        hashes[name] = hashlib.sha256(raw).hexdigest()
        tables[name] = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))))
        if not tables[name]:
            raise ValueError(f"Empty BankShield {name} file")
    customers = {r["customer_id"] for r in tables["customers"]}
    accounts = {r["account_id"]: r for r in tables["accounts"]}
    transactions = {r["transaction_id"]: r for r in tables["transactions"]}
    dates = [valid_date(r["transaction_date"]) for r in tables["transactions"]]
    meta = dict(id="bankshield", name="BankShield public sample", currency="USD", version=REVISION,
                source="Publisher-provided synthetic public sample", sourceUrl=SOURCE, label="Fraud-labelled transactions",
                periods=sorted({d[:7] for d in dates if d}), regions=sorted({r["location_country"] for r in transactions.values()}),
                fileHashes=hashes, licenseStatus="README permits commercial use; complete licence terms not supplied in repository",
                limitations=["Incomplete sample: missing parents are retained and are never invented.",
                              "No transaction-level device ID; shared-device and new-device analyses are unavailable.",
                              "Fraud labels are synthetic ground truth, not an operational bank adjudication or confirmed loss.",
                              "98 of 260 account-linked sample transactions predate account opening; histories need further validation.",
                              "Transaction values are USD; account balances have mixed currencies and are not aggregated."],
                coverage=dict(transactions=len(transactions), customers=len(customers), accounts=len(accounts), alerts=len(tables["fraud_alerts"]),
                              missingDates=sum(d is None for d in dates), missingAccounts=sum(r["account_id"] not in accounts for r in transactions.values()),
                              missingAlertTransactions=sum(r["transaction_id"] not in transactions for r in tables["fraud_alerts"]),
                              completeCustomerChains=sum(r["account_id"] in accounts and accounts[r["account_id"]]["customer_id"] in customers for r in transactions.values())))
    with connect() as db:
        clear(db, "bankshield")
        db.executemany("INSERT INTO customers VALUES(?,?)", [("bankshield", r) for r in customers])
        db.executemany("INSERT INTO accounts VALUES(?,?,?,?)", [("bankshield", r["account_id"], r["customer_id"], valid_date(r["opened_date"])) for r in accounts.values()])
        db.executemany("INSERT INTO transactions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)", [
            ("bankshield", r["transaction_id"], r["account_id"], date, date[:7] if date else None, minor(r["amount_usd"]),
             r["location_country"], r["merchant_category"], r["device_type"], None, None, boolean(r["is_fraud"]), None)
            for r, date in zip(tables["transactions"], dates)])
        db.executemany("INSERT INTO fraud_alerts VALUES(?,?,?,?,?,?,?)", [("bankshield", r["alert_id"], r["transaction_id"], valid_date(r["alert_timestamp"]), r["alert_type"], r["alert_status"], float(r["risk_score"])) for r in tables["fraud_alerts"]])
        db.executemany("INSERT INTO fraud_outcomes VALUES(?,?,?,?,?)", [("bankshield", r["transaction_id"], "fraud_label" if boolean(r["is_fraud"]) else "legitimate_label", None, "Publisher synthetic label; observation time unknown") for r in tables["transactions"]])
        db.executemany("INSERT INTO devices VALUES(?,?,?,?,?)", [("bankshield", r["device_id"], r["customer_id"], valid_date(r["first_seen"]), valid_date(r["last_seen"])) for r in tables["devices"]])
        db.execute("INSERT OR REPLACE INTO datasets VALUES(?,?)", ("bankshield", json.dumps(meta)))


if __name__ == "__main__":
    initialize()
    seed_meridian()
    seed_bankshield()
    print("Imported Meridian and revision-pinned BankShield into local SQLite; no external AI calls.")
