"""Local form reader and validated onboarding tool. Uploaded text cannot choose tools."""

import io
import json
import re
import threading

import fitz
from PIL import Image

from backend.core.database import connect
from backend.core.identifiers import identifier, now
from backend.features.customers.models import CustomerFields

Image.MAX_IMAGE_PIXELS = 25_000_000
_engine = None
_ocr_lock = threading.Lock()


def image_text(content):
    global _engine
    with Image.open(io.BytesIO(content)) as image:
        image.load()
        image = image.convert("RGB")
        image.thumbnail((2200, 2200))
        import numpy as np

        pixels = np.asarray(image)
    with _ocr_lock:
        if _engine is None:
            from rapidocr_onnxruntime import RapidOCR

            _engine = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
        result, _ = _engine(pixels)
    return "\n".join(r[1] for r in result or [])


def extract_fields(text):
    aliases = {
        "fullName": ["full name", "customer name", "applicant name", "name"],
        "dateOfBirth": ["date of birth", "dob"],
        "email": ["email address", "email", "e-mail"],
        "phone": ["mobile number", "phone number", "mobile", "phone"],
        "address": ["residential address", "address"],
        "city": ["city"],
        "state": ["state"],
        "postalCode": ["pin code", "pincode", "postal code", "zip"],
    }
    fields = {key: "" for key in aliases}
    lines = text.splitlines()
    for key, labels in aliases.items():
        for index, line in enumerate(lines):
            match = re.match(
                r"^\s*(?:"
                + "|".join(re.escape(l) for l in labels)
                + r")\s*[:=\-]\s*(.*?)\s*$",
                line,
                re.I,
            )
            if match:
                fields[key] = match[1] or (
                    lines[index + 1].strip() if index + 1 < len(lines) else ""
                )
                break
    if fields["dateOfBirth"]:
        from datetime import datetime

        original = fields["dateOfBirth"]
        fields["dateOfBirth"] = ""
        for pattern in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                fields["dateOfBirth"] = (
                    datetime.strptime(original, pattern).date().isoformat()
                )
                break
            except ValueError:
                pass
    # Candidate values remain editable; invalid OCR values do not become trusted records.
    return fields


def extract_document(content):
    pages = []
    if content.startswith(b"%PDF"):
        with fitz.open(stream=content, filetype="pdf") as pdf:
            if pdf.is_encrypted:
                raise ValueError("Use an unencrypted PDF for extraction.")
            if not 1 <= len(pdf) <= 5:
                raise ValueError("Upload a form with 1–5 pages.")
            for page in pdf:
                text = page.get_text().strip()
                # Mixed PDFs often have a digital footer over an otherwise scanned form.
                # Existing text must not cause the embedded scan to be skipped.
                if not text or page.get_images():
                    if page.rect.width * page.rect.height * 1.6**2 > 25_000_000:
                        raise ValueError(
                            "PDF page dimensions exceed the scan processing limit."
                        )
                    scanned = image_text(
                        page.get_pixmap(matrix=fitz.Matrix(1.6, 1.6)).tobytes("png")
                    )
                    text = scanned + (
                        "\n" + text if text and text not in scanned else ""
                    )
                pages.append(text)
    else:
        try:
            pages = [image_text(content)]
        except (OSError, Image.DecompressionBombError) as error:
            raise ValueError("Upload a valid PNG, JPEG, or PDF form.") from error
    text = "\n".join(pages)
    if not text.strip():
        raise ValueError("No readable text was found. Upload a clearer scan.")
    if len(text) > 40000:
        raise ValueError("This document exceeds the bounded form extraction limit.")
    markdown = (
        "# Extracted banking form\n\n> Local extraction draft. Review against the original before saving.\n\n"
        + "\n\n".join(f"## Page {i + 1}\n\n" + p for i, p in enumerate(pages))
    )
    fields = extract_fields(text)
    return dict(
        markdown=markdown,
        fields=fields,
        warnings=[
            "Local OCR is intended for clear printed English text. Handwriting and regional languages require evaluation or manual correction."
        ],
    )


def read_form(content, filename):
    from backend.core.security import require

    require("form_read")
    from backend.integrations.ai import FormExtraction, get_provider

    provider = get_provider()
    # Input limits apply to both providers before document bytes can leave the process.
    if not content or len(content) > 8 * 1024 * 1024:
        raise ValueError("Upload a non-empty form up to 8 MB.")
    if content.startswith(b"%PDF"):
        with fitz.open(stream=content, filetype="pdf") as pdf:
            if pdf.is_encrypted or not 1 <= len(pdf) <= 5:
                raise ValueError("Upload an unencrypted PDF with 1–5 pages.")
        mime = "application/pdf"
    else:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
            if image.width * image.height > 25_000_000 or image.format not in (
                "PNG",
                "JPEG",
            ):
                raise ValueError("Upload a PNG/JPEG image within the pixel limit.")
            mime = "image/png" if image.format == "PNG" else "image/jpeg"
    extracted = FormExtraction.model_validate(provider.extract_form(content, mime))
    from backend.core.progress import emit

    emit("Form extraction validated")
    draft_id = identifier("FORM")
    markdown, fields = extracted.markdown, extracted.fields.model_dump()
    with connect() as db:
        db.execute(
            "INSERT INTO form_drafts(id,filename,markdown,fields,created_at) VALUES(?,?,?,?,?)",
            (draft_id, filename, markdown, json.dumps(fields), now()),
        )
        import hashlib

        from backend.features.forms.quality import provenance, quality

        sources = provenance(fields, markdown, provider.name)
        db.execute(
            "INSERT INTO form_quality VALUES(?,?,?,?,?,?)",
            (
                draft_id,
                hashlib.sha256(content).hexdigest(),
                provider.name,
                json.dumps(fields),
                json.dumps(sources),
                1,
            ),
        )
        from backend.core.security import actor

        db.execute(
            "INSERT INTO form_review_versions VALUES(?,?,?,?,?,?)",
            (
                draft_id,
                1,
                json.dumps(fields),
                actor().actor_id,
                "Original extraction",
                now(),
            ),
        )
        review = quality(db, draft_id)
        from backend.features.customers.kyc import ensure_form_case

        ensure_form_case(db, draft_id)
    return dict(
        id=draft_id,
        filename=filename,
        markdown=markdown,
        fields=fields,
        status="pending",
        provider=provider.name,
        externalTransmission=provider.external,
        **review,
        warnings=[
            *extracted.warnings,
            "The draft does not perform KYC verification or open a bank account.",
            "Original upload bytes are discarded after extraction; extracted content is stored for review.",
        ],
    )


def add_customer(
    draft_id,
    fields,
    duplicate_decision=None,
    duplicate_reason="",
    review_revision=None,
    *,
    connection=None,
    approval_id=None,
):
    from backend.core.security import require

    require("customer_write")
    values = CustomerFields.model_validate(fields).model_dump()
    if len(values["fullName"].strip()) < 2 or not values["dateOfBirth"]:
        raise ValueError(
            "Review and supply the customer's name and date of birth before saving."
        )
    from contextlib import nullcontext

    with nullcontext(connection) if connection is not None else connect() as db:
        if not db.in_transaction:
            db.execute("BEGIN IMMEDIATE")
        draft = db.execute(
            "SELECT * FROM form_drafts WHERE id=?", (draft_id,)
        ).fetchone()
        if not draft:
            raise ValueError("Form draft not found.")
        if draft["status"] == "deleted":
            raise ValueError(
                "This customer profile was deleted. Upload a new form to begin again."
            )
        if draft["status"] == "saved":
            return dict(
                customerId=draft["customer_id"],
                status="pending_verification",
                duplicate=True,
            )
        if draft["status"] == "rejected":
            raise ValueError(
                "This form request was rejected. Upload a new corrected application."
            )
        from backend.core.security import actor

        approval = db.execute(
            "SELECT * FROM admin_approval_requests WHERE id=? AND draft_id=? AND status='pending' AND tenant=?",
            (approval_id, draft_id, actor().tenant),
        ).fetchone()
        if (
            connection is None
            or draft["status"] != "submitted"
            or not approval
            or json.loads(approval["snapshot"])["fields"] != values
        ):
            raise PermissionError(
                "OCR customer creation requires an explicit admin approval decision."
            )
        from backend.features.forms.quality import quality

        review = quality(db, draft_id, values)
        if review_revision is not None and review_revision != review["revision"]:
            raise ValueError(
                "The form review changed. Reload and review the latest version."
            )
        candidates = review["possibleDuplicates"]
        if candidates:
            if duplicate_decision not in ("reuse", "create_separate"):
                raise ValueError(
                    "Possible existing customer found. Review the duplicate decision before saving."
                )
            if len(duplicate_reason.strip()) < 5:
                raise ValueError("Record a reason for the duplicate decision.")
            if duplicate_decision == "reuse":
                if len(candidates) != 1:
                    raise ValueError(
                        "More than one possible match exists. Do not auto-link an ambiguous person match."
                    )
                customer_id = candidates[0]["customerId"]
                from backend.features.forms.quality import record_confirmed

                review["revision"] = record_confirmed(
                    db, draft, values, review, duplicate_reason
                )
                from backend.core.security import actor

                db.execute(
                    "UPDATE form_drafts SET status='saved',customer_id=?,fields=? WHERE id=?",
                    (customer_id, json.dumps(values), draft_id),
                )
                from backend.features.customers.kyc import ensure_form_case

                ensure_form_case(db, draft_id, customer_id)
                db.execute(
                    "INSERT INTO audit_runs VALUES(?,?,?,?,?,?)",
                    (
                        identifier("RUN"),
                        "form_linked_existing_customer",
                        json.dumps(
                            dict(
                                draftId=draft_id,
                                customerId=customer_id,
                                actor=actor().actor_id,
                                revision=review["revision"],
                                approvalId=approval_id,
                            )
                        ),
                        duplicate_reason.strip()[:500],
                        now(),
                        "",
                    ),
                )
                return dict(
                    customerId=customer_id,
                    status="pending_verification",
                    duplicate=True,
                )
        from backend.features.forms.quality import record_confirmed

        review["revision"] = record_confirmed(
            db, draft, values, review, duplicate_reason
        )
        customer_id = identifier("CUS")
        db.execute("INSERT INTO customers VALUES(?,?)", ("meridian", customer_id))
        db.execute(
            "INSERT INTO customer_profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                customer_id,
                "meridian",
                values["fullName"].strip(),
                values["dateOfBirth"],
                values["email"],
                values["phone"],
                values["address"],
                values["city"],
                values["state"],
                values["postalCode"],
                "pending_verification",
                draft_id,
                now(),
            ),
        )
        db.execute(
            "UPDATE form_drafts SET status='saved',customer_id=?,fields=? WHERE id=?",
            (customer_id, json.dumps(values), draft_id),
        )
        from backend.features.customers.kyc import ensure_form_case

        ensure_form_case(db, draft_id, customer_id)
        from backend.core.security import actor

        db.execute(
            "INSERT INTO audit_runs VALUES(?,?,?,?,?,?)",
            (
                identifier("RUN"),
                "customer_added_after_review",
                json.dumps(
                    {
                        "datasetId": "meridian",
                        "draftId": draft_id,
                        "customerId": customer_id,
                        "actor": actor().actor_id,
                        "reviewRevision": review["revision"],
                        "duplicateDecision": duplicate_decision,
                        "approvalId": approval_id,
                    }
                ),
                duplicate_reason[:500]
                if duplicate_decision
                else "Explicit admin approval",
                now(),
                "",
            ),
        )
    return dict(customerId=customer_id, status="pending_verification", duplicate=False)
