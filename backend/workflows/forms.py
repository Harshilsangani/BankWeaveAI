"""Upload validation and form-analysis publication in the owned conversation."""

from backend.core.database import metadata
from backend.workflows.analyst import run_upload


def extract_uploaded_content(content, filename):
    import tempfile
    from pathlib import Path

    with tempfile.TemporaryDirectory(prefix="risklens-form-") as directory:
        path = Path(directory) / "source-upload"
        path.write_bytes(content)
        try:
            draft = run_upload(path, filename)
            from backend.core.identifiers import now
            from backend.features.workspaces.artifacts import persist

            response = dict(
                id=draft["id"],
                question=f"Read filled form: {filename}",
                title="Form extracted · review before saving",
                timestamp=now(),
                context=dict(domain="fraud", datasetId="meridian"),
                blocks=[dict(type="FORM", draft=draft)],
                suggestions=[],
            )
            from backend.features.analytics.queries import analysis_metadata

            response["analysis"] = analysis_metadata(
                dict(datasetId="meridian", period=metadata("meridian")["periods"][-1]),
                draft["threadId"],
            )
            response["analysis"].update(
                datasetName="Customer onboarding",
                period="Uploaded form",
                baseline="Not applicable",
                stages=draft["stages"],
                provider=draft["provider"],
                externalTransmission=draft["externalTransmission"],
                outboundFields=["uploadedDocumentBytes"]
                if draft["externalTransmission"]
                else [],
            )
            persist("analyst", response, response["context"])
            return draft
        except ValueError:
            raise
        except Exception as error:
            raise ValueError(
                "The form could not be read. Use a clear, unencrypted PDF or PNG/JPEG image."
            ) from error
