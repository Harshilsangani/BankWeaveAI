"""Bounded observed links, frozen into investigation artifacts. No guessed edges."""

import hashlib
import json

from backend.core.database import connect, metadata
from backend.features.analytics.scope import condition

VERSION = "observed-relationships-v1"


def build(scope):
    meta = metadata(scope["datasetId"])
    base = dict(
        version=VERSION,
        sourceVersion=meta["version"],
        scope=scope,
        nodes=[],
        edges=[],
        sampledTransactions=0,
        limitations=[
            "Connections come from recorded customer/account/transaction/device-event keys. Shared devices do not prove fraud, collusion or identity.",
            "The graph is a bounded sample of flagged transactions, not the complete customer network.",
        ],
    )
    if scope["datasetId"] != "meridian" or scope.get("domain") == "loans":
        return {
            **base,
            "available": False,
            "reason": "This dataset/scope has no validated transaction-to-device mapping. Missing links are not inferred.",
        }
    sql, args = condition(scope)
    with connect() as db:
        total = db.execute(
            f"SELECT COUNT(*) FROM transactions WHERE {sql} AND flagged=1", args
        ).fetchone()[0]
        devices = db.execute(
            f"""SELECT device_id,COUNT(*) transactions,COUNT(DISTINCT account_id) accounts FROM transactions WHERE {sql} AND flagged=1 AND device_id IS NOT NULL GROUP BY device_id ORDER BY accounts DESC,transactions DESC,device_id LIMIT 3""",
            args,
        ).fetchall()
        rows = []
        for device in devices:
            rows += [
                dict(row)
                for row in db.execute(
                    f"""SELECT t.id,t.account_id,t.device_id,t.amount_minor,t.occurred_at,a.customer_id,c.id valid_customer,d.id valid_device,e.transaction_id observed_event FROM (SELECT * FROM transactions WHERE {sql} AND flagged=1 AND device_id=?) t LEFT JOIN accounts a ON a.dataset=t.dataset AND a.id=t.account_id LEFT JOIN customers c ON c.dataset=a.dataset AND c.id=a.customer_id LEFT JOIN devices d ON d.dataset=t.dataset AND d.id=t.device_id LEFT JOIN device_events e ON e.dataset=t.dataset AND e.transaction_id=t.id AND e.device_id=t.device_id ORDER BY t.amount_minor DESC,t.id LIMIT 4""",
                    [*args, device["device_id"]],
                )
            ]
    nodes = {}
    edges = {}

    def node(kind, id):
        key = kind + ":" + id
        nodes.setdefault(key, dict(id=key, kind=kind, label=id))
        return key

    def edge(source, target, relation, reference):
        key = source + ">" + target
        references = edges.setdefault(
            key,
            dict(
                id=key, source=source, target=target, relation=relation, references=[]
            ),
        )["references"]
        if reference not in references:
            references.append(reference)

    for row in rows:
        transaction = node("transaction", row["id"])
        if row["customer_id"]:
            account = node("account", row["account_id"])
            edge(account, transaction, "recorded transaction", row["id"])
            if row["valid_customer"]:
                edge(
                    node("customer", row["customer_id"]),
                    account,
                    "recorded account holder",
                    row["account_id"],
                )
        if row["valid_device"] and row["observed_event"]:
            edge(
                transaction,
                node("device", row["device_id"]),
                "recorded device event",
                row["observed_event"],
            )
    base.update(
        available=True,
        nodes=list(nodes.values()),
        edges=list(edges.values()),
        sampledTransactions=len(rows),
        totalFlaggedTransactions=total,
        deviceGroups=[dict(row) for row in devices],
    )
    base["snapshotHash"] = hashlib.sha256(
        json.dumps(base, sort_keys=True).encode()
    ).hexdigest()
    return base
