"""Supervised campaign worker. Reads durable jobs; never migrates or seeds data."""

import argparse
import json
import signal
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from backend.core.database import connect
from backend.core.security import Identity, current_identity
from backend.features.campaigns.data import TENANT, encode, readiness
from backend.features.campaigns.jobs import enqueue, work_once


def enqueue_scheduled(at=None):
    at = at or datetime.now(ZoneInfo("Asia/Kolkata"))
    period = at.strftime("%Y-%m")
    if at < at.replace(day=1, hour=9, minute=0, second=0, microsecond=0):
        return 0
    queued = 0
    identity = Identity(
        "system-card-campaign-runner", "campaign_worker", TENANT, "internal"
    )
    with connect() as db:
        campaigns = [
            dict(row)
            for row in db.execute(
                "SELECT * FROM card_campaigns WHERE tenant=? AND schedule_enabled=1 AND (schedule_last_period IS NULL OR schedule_last_period!=?)",
                (TENANT, period),
            )
        ]
    for campaign in campaigns:
        config = json.loads(campaign["configuration"])
        available = readiness(config["datasetId"], period, TENANT)
        if not available["ready"]:
            config["scheduleStatus"] = (
                f"Waiting for source coverage for {available['cutoff']}. No new-month records were invented."
            )
            with connect() as db:
                db.execute(
                    "UPDATE card_campaigns SET configuration=? WHERE id=? AND revision=?",
                    (encode(config), campaign["id"], campaign["revision"]),
                )
            continue
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            current = db.execute(
                "SELECT * FROM card_campaigns WHERE id=?", (campaign["id"],)
            ).fetchone()
            if (
                not current["schedule_enabled"]
                or current["schedule_last_period"] == period
            ):
                continue
            config = json.loads(current["configuration"])
            config.pop("scheduleStatus", None)
            revision = current["revision"] + int(config["period"] != period)
            config.update(period=period, batchId=available["batch"]["id"])
            db.execute(
                "UPDATE card_campaigns SET revision=?,configuration=? WHERE id=?",
                (revision, encode(config), campaign["id"]),
            )
        token = current_identity.set(identity)
        try:
            enqueue(
                campaign["id"],
                "schedule-" + campaign["id"][-24:] + "-" + period,
                scheduled=True,
                identity=identity,
            )
            with connect() as db:
                db.execute(
                    "UPDATE card_campaigns SET schedule_last_period=? WHERE id=?",
                    (period, campaign["id"]),
                )
            queued += 1
        finally:
            current_identity.reset(token)
    return queued


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--once", action="store_true", help="Drain accepted jobs once, then exit."
    )
    parser.add_argument(
        "--enqueue-scheduled",
        action="store_true",
        help="Enqueue enabled due monthly campaigns, then exit.",
    )
    args = parser.parse_args()
    if args.enqueue_scheduled:
        print(json.dumps({"scheduledRuns": enqueue_scheduled()}))
        return
    stop = threading.Event()
    for name in (signal.SIGINT, signal.SIGTERM):
        signal.signal(name, lambda signum, frame: stop.set())
    processed = 0
    schedule_check = 0
    while not stop.is_set():
        if not args.once and time.monotonic() - schedule_check > 60:
            enqueue_scheduled()
            schedule_check = time.monotonic()
        if work_once():
            processed += 1
            print("Campaign run processed.", flush=True)
        elif args.once:
            break
        else:
            stop.wait(2)
    if args.once:
        print(json.dumps({"processed": processed}))


if __name__ == "__main__":
    main()
