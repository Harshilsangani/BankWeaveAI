"""Opt-in live Vertex acceptance against a private, disposable database copy."""

import argparse
import json
import os
import sqlite3
import tempfile
import time
import uuid
from pathlib import Path


def snapshot(path):
    with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as db:
        db.execute("PRAGMA query_only=ON")
        return {
            table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in (
                "customers",
                "customer_profiles",
                "accounts",
                "transactions",
                "loans",
                "conversations",
                "form_drafts",
                "admin_approval_requests",
                "report_files",
            )
        }


def evaluate(storage, project, location, model):
    source = storage / "risklens.sqlite3"
    if not source.is_file():
        raise ValueError(
            "Supply an existing storage directory. This evaluator never seeds data."
        )
    before = snapshot(source)
    cases = []
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="bankweave-live-vertex-") as temporary:
        directory = Path(temporary)
        target = directory / "risklens.sqlite3"
        # SQLite's backup API includes committed WAL contents; copying the file
        # alone could miss records from the running application.
        with sqlite3.connect(
            source.resolve().as_uri() + "?mode=ro", uri=True
        ) as original:
            with sqlite3.connect(target) as copy:
                original.backup(copy)
        os.environ.update(
            RISKLENS_STORAGE_DIR=str(directory),
            RISKLENS_DB=str(target),
            RISKLENS_CHECKPOINT_DB=str(directory / "checkpoints.sqlite3"),
            RISKLENS_PROVIDER="vertex",
            RISKLENS_ENABLE_VERTEX="true",
            RISKLENS_GCP_PROJECT=project,
            RISKLENS_GCP_LOCATION=location,
            RISKLENS_VERTEX_MODEL=model,
            RISKLENS_ENV="development",
            RISKLENS_IDENTITY_ADAPTER="development",
            RISKLENS_AUTO_SEED="false",
        )
        # Import graph/storage modules only after isolation is configured.
        from fastapi.testclient import TestClient

        from backend.app import app
        from backend.core.database import connect
        from backend.features.analyst.service import analyst
        from backend.features.knowledge.service import retrieve
        from backend.integrations.ai import (
            LocalProvider,
            provider_override,
            provider_usage,
        )

        usage = []
        usage_token = provider_usage.set(usage)
        context = dict(datasetId="meridian", domain="fraud", period="2026-09")
        pack = json.loads((Path(__file__).parent / "cases/questions.json").read_text())
        pack.extend(
            [
                dict(
                    id="greeting",
                    query="Hello!",
                    context=context,
                    agent="General chat agent",
                ),
                dict(
                    id="conceptual-chat",
                    query="Explain what a bank reconciliation means.",
                    context=context,
                    agent="General chat agent",
                ),
                dict(
                    id="historical-credit-gap",
                    query="Show total credit for the past five years",
                    context=context,
                    title="Historical data coverage",
                    noKpi=True,
                ),
                dict(
                    id="kyc-policy",
                    query="What is the KYC review policy?",
                    context=context,
                    title="Policy evidence",
                ),
                dict(
                    id="unknown-policy-gap",
                    query="What is the policy for lunar cryptocurrency custody?",
                    context=context,
                    title="Policy coverage gap",
                ),
            ]
        )

        def record(case_id, errors, **details):
            result = dict(id=case_id, passed=not errors, errors=errors, **details)
            cases.append(result)
            print(
                json.dumps(
                    {
                        key: value
                        for key, value in result.items()
                        if key not in ("text", "analysis")
                    }
                ),
                flush=True,
            )

        with TestClient(app) as client:
            headers = {
                "x-risklens-session": str(uuid.uuid4()),
                "x-risklens-role": "analyst",
            }
            profiles = before["customer_profiles"]
            for case in pack:
                errors = []
                baseline = None
                if case.get("status", 200) == 200 and case["id"] not in (
                    "greeting",
                    "conceptual-chat",
                    "chat-write-refusal",
                    "kyc-policy",
                    "unknown-policy-gap",
                ):
                    token = provider_override.set(LocalProvider())
                    try:
                        baseline = analyst(
                            case["query"], case["context"], persist_result=False
                        )
                    finally:
                        provider_override.reset(token)
                start = time.monotonic()
                response = client.post(
                    "/analyst",
                    json=dict(query=case["query"], context=case["context"]),
                    headers=headers,
                )
                if response.status_code != case.get("status", 200):
                    errors.append(
                        "Unexpected HTTP status: " + str(response.status_code)
                    )
                details = dict(
                    status=response.status_code,
                    seconds=round(time.monotonic() - start, 2),
                )
                if response.status_code == 200:
                    payload = response.json()
                    blocks = payload["blocks"]
                    text = "\n".join(
                        block["text"] for block in blocks if block["type"] == "TEXT"
                    )
                    kpis = [block for block in blocks if block["type"] == "KPI"]
                    charts = [block for block in blocks if block["type"] == "CHART"]
                    details.update(
                        title=payload["title"],
                        text=text,
                        kpiValues=[
                            metric["value"]
                            for block in kpis
                            for metric in block["metrics"]
                        ],
                        chartCount=len(charts),
                        analysis=payload["analysis"],
                    )
                    if case.get("count") and (
                        not kpis or kpis[0]["metrics"][0]["value"] != case["count"]
                    ):
                        errors.append("KPI differs from the expected source snapshot")
                    if case.get("noKpi") and kpis:
                        errors.append("Unsupported request produced metrics")
                    for field in ("region", "comparison", "period", "domain"):
                        if (
                            field in case
                            and payload["context"].get(field) != case[field]
                        ):
                            errors.append("Incorrect scope: " + field)
                    if case.get("title") and payload["title"] != case["title"]:
                        errors.append("Incorrect response kind")
                    if case.get("summary") and case["summary"] not in text:
                        errors.append(
                            "Verified source summary missing from explanation"
                        )
                    if (
                        payload["analysis"]["provider"] != "vertex"
                        or payload["analysis"].get("model") != model
                    ):
                        errors.append("Response did not use the selected Vertex model")
                    if not payload["analysis"]["externalTransmission"]:
                        errors.append("Live provider transmission was not disclosed")
                    if baseline:
                        source_kpis = [
                            block["metrics"]
                            for block in baseline["blocks"]
                            if block["type"] == "KPI"
                        ]
                        if [block["metrics"] for block in kpis] != source_kpis:
                            errors.append(
                                "KPI values changed from the database-calculated result"
                            )
                        source_charts = [
                            block["points"]
                            for block in baseline["blocks"]
                            if block["type"] == "CHART"
                        ]
                        if [block["points"] for block in charts] != source_charts:
                            errors.append(
                                "Chart points changed from the database-calculated result"
                            )
                        if (
                            kpis
                            and "aggregateFacts"
                            not in payload["analysis"]["outboundFields"]
                        ):
                            errors.append(
                                "Gemini was not supplied verified aggregate facts"
                            )
                    if (
                        case.get("agent")
                        and case["agent"] not in payload["analysis"]["stages"]
                    ):
                        errors.append("Incorrect agent routing")
                    if (
                        case["id"] == "chat-write-refusal"
                        and "approval" not in text.lower()
                    ):
                        errors.append("Onboarding reply omitted the approval workflow")
                    if case["id"] == "kyc-policy":
                        allowed = {
                            chunk["reference"] for chunk in retrieve(case["query"])
                        }
                        evidence = [
                            item
                            for block in blocks
                            if block["type"] == "EVIDENCE"
                            for item in block["evidence"]
                        ]
                        if not evidence or any(
                            item["id"] not in allowed for item in evidence
                        ):
                            errors.append(
                                "Policy answer lacks valid supplied citations"
                            )
                    if not text.strip():
                        errors.append("Empty chatbot response")
                else:
                    details["error"] = response.json().get("error")
                with connect() as db:
                    if (
                        db.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[
                            0
                        ]
                        != profiles
                    ):
                        errors.append("Chat changed customer profiles")
                record(case["id"], errors, **details)

            # Real provider extraction uses only a generated fictional form.
            import io

            import fitz
            from PIL import Image, ImageDraw, ImageFont

            form_text = "CUSTOMER APPLICATION\nFull Name: Gemini QA Person\nDate of Birth: 1995-06-15\nEmail: gemini-qa@example.test\nMobile Number: 9876543210\nAddress: 12 Demo Road\nCity: Ahmedabad\nState: Gujarat\nPIN Code: 380001"
            document = fitz.open()
            page = document.new_page()
            page.insert_text((60, 80), form_text, fontsize=15)
            pdf = document.tobytes()
            document.close()
            image = Image.new("RGB", (1400, 1100), "white")
            ImageDraw.Draw(image).multiline_text(
                (65, 65),
                form_text,
                font=ImageFont.load_default(size=38),
                fill="black",
                spacing=30,
            )
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            for name, content, mime in [
                ("pdf-form", pdf, "application/pdf"),
                ("image-form", buffer.getvalue(), "image/png"),
            ]:
                start = time.monotonic()
                response = client.post(
                    "/forms", files={"file": (name, content, mime)}, headers=headers
                )
                errors = []
                if response.status_code != 200:
                    errors.append(
                        "Form extraction failed: " + str(response.status_code)
                    )
                else:
                    draft = response.json()
                    expected = dict(
                        fullName="Gemini QA Person",
                        dateOfBirth="1995-06-15",
                        email="gemini-qa@example.test",
                        city="Ahmedabad",
                        postalCode="380001",
                    )
                    if any(
                        draft["fields"][key] != value for key, value in expected.items()
                    ):
                        errors.append(
                            "Extracted fields differ from the fictional source form"
                        )
                    if (
                        draft["status"] != "pending"
                        or draft["provider"] != "vertex"
                        or not draft["externalTransmission"]
                    ):
                        errors.append("Incorrect draft/provider/transmission state")
                    if not draft["markdown"].strip():
                        errors.append("Empty extracted Markdown")
                with connect() as db:
                    if (
                        db.execute("SELECT COUNT(*) FROM customer_profiles").fetchone()[
                            0
                        ]
                        != profiles
                    ):
                        errors.append("Extraction created a customer without approval")
                record(
                    name,
                    errors,
                    status=response.status_code,
                    seconds=round(time.monotonic() - start, 2),
                )

            request_id = str(uuid.uuid4())
            stream_headers = {**headers, "x-risklens-request-id": request_id}
            stream_input = dict(
                query="Why did fraud increase this month?", context=context
            )
            response = client.post(
                "/analyst/stream", json=stream_input, headers=stream_headers
            )
            events = [
                json.loads(line[6:])
                for line in response.text.splitlines()
                if line.startswith("data: ")
            ]
            results = [event for event in events if event["type"] == "result"]
            errors = (
                []
                if response.status_code == 200
                and results
                and any(event["type"] == "progress" for event in events)
                else ["Stream did not return progress and a result"]
            )
            calls_before_replay = len(usage)
            replay = client.post(
                "/analyst/stream", json=stream_input, headers=stream_headers
            )
            replay_events = [
                json.loads(line[6:])
                for line in replay.text.splitlines()
                if line.startswith("data: ")
            ]
            if (
                not replay_events
                or not replay_events[0].get("replayed")
                or len(usage) != calls_before_replay
            ):
                errors.append(
                    "Stream retry did not replay without an additional model call"
                )
            record("stream-and-replay", errors, status=response.status_code)

            calls_before_denial = len(usage)
            denied = client.post(
                "/analyst",
                json=dict(query="Show fraud", context=context),
                headers={"x-risklens-role": "viewer"},
            )
            record(
                "viewer-denied-before-model-call",
                []
                if denied.status_code == 403 and len(usage) == calls_before_denial
                else ["Viewer was not denied before the model call"],
                status=denied.status_code,
            )
        provider_usage.reset(usage_token)
    after = snapshot(source)
    record(
        "working-storage-preserved",
        []
        if before == after
        else ["Working storage changed during isolated evaluation"],
        counts=after,
    )
    return dict(
        provider="vertex",
        liveGeminiEvaluated=True,
        project=project,
        location=location,
        model=model,
        passed=sum(case["passed"] for case in cases),
        total=len(cases),
        modelRequests=len(usage),
        inputTokens=sum(item["inputTokens"] for item in usage),
        outputTokens=sum(item["outputTokens"] for item in usage),
        totalTokens=sum(item["totalTokens"] for item in usage),
        seconds=round(time.monotonic() - started, 2),
        cases=cases,
        boundary="Live, billable Vertex requests; synthetic forms; all application writes confined to a disposable database copy. This does not complete cloud identity, managed persistence or data-handling acceptance.",
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--allow-live",
        action="store_true",
        required=True,
        help="Explicitly opt into billable model requests.",
    )
    parser.add_argument("--storage", type=Path, required=True)
    parser.add_argument("--project", required=True)
    parser.add_argument("--location", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument(
        "--output", type=Path, default=Path("artifacts/evaluation/vertex-results.json")
    )
    args = parser.parse_args()
    result = evaluate(args.storage, args.project, args.location, args.model)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(
        json.dumps({key: value for key, value in result.items() if key != "cases"}),
        flush=True,
    )
    return 0 if result["passed"] == result["total"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
