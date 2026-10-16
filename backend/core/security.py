"""Staff authorization seam. Development headers are never production credentials."""

import os
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Protocol

PERMISSIONS = {
    "viewer": {"read"},
    "analyst": {"read", "analyze", "form_read", "form_submit"},
    "admin": {
        "read",
        "analyze",
        "form_read",
        "form_submit",
        "customer_write",
        "approval_review",
    },
}
PERMISSIONS["viewer"].add("campaign_summary")
PERMISSIONS["analyst"].update({"campaign_summary", "campaign_read", "campaign_run"})
PERMISSIONS["admin"].update(
    {
        "campaign_summary",
        "campaign_read",
        "campaign_run",
        "campaign_admin",
        "campaign_review",
    }
)
SERVICE_PERMISSIONS = {"campaign_worker": {"campaign_run"}}


def canonical_role(role):
    # Legacy header/actor IDs remain usable so owned saved work is not renamed.
    return "analyst" if role == "customer_operator" else role


@dataclass(frozen=True)
class Identity:
    actor_id: str
    role: str
    tenant: str = "meridian-demo"
    adapter: str = "development"

    def __post_init__(self):
        object.__setattr__(self, "role", canonical_role(self.role))


class IdentityAdapter(Protocol):
    def resolve(self, request) -> Identity: ...


class DevelopmentIdentity:
    def resolve(self, request):
        if os.environ.get("RISKLENS_ENV", "development") == "production":
            raise PermissionError(
                "Production staff identity is not configured; development identities are rejected."
            )
        role = request.headers.get("x-risklens-role", "customer_operator")
        if canonical_role(role) not in ("viewer", "analyst", "admin"):
            raise PermissionError("Choose a supported development staff role.")
        return Identity(actor_id="local-" + role, role=role)


class ConfiguredIdentity:
    def __init__(self):
        self.development = DevelopmentIdentity()
        self.iap = None

    def resolve(self, request):
        mode = os.environ.get("RISKLENS_IDENTITY_ADAPTER", "development")
        if mode == "development":
            return self.development.resolve(request)
        if mode == "iap":
            if self.iap is None:
                from backend.core.iap_identity import IAPIdentity

                self.iap = IAPIdentity()
            return self.iap.resolve(request)
        raise PermissionError("The configured staff identity adapter is unsupported.")


identity_adapter: IdentityAdapter = ConfiguredIdentity()
current_identity = ContextVar("current_identity", default=None)


def actor():
    identity = current_identity.get()
    if identity is None:
        if (
            os.environ.get("RISKLENS_ENV", "development") == "production"
            or os.environ.get("RISKLENS_IDENTITY_ADAPTER", "development")
            != "development"
        ):
            raise PermissionError(
                "A verified staff identity is required for this tool."
            )
        identity = Identity("local-customer_operator", "customer_operator")
    return identity


def require(permission):
    identity = actor()
    permissions = PERMISSIONS.get(identity.role, set())
    if (
        identity.adapter == "internal"
        and identity.actor_id == "system-card-campaign-runner"
        and identity.tenant == "meridian-demo"
    ):
        permissions = SERVICE_PERMISSIONS.get(identity.role, set())
    if permission not in permissions:
        raise PermissionError(
            f"The {identity.role.replace('_', ' ')} role does not have {permission.replace('_', ' ')} permission."
        )
    return identity


def permission_for(method, path):
    if path.startswith(
        ("/card-campaigns", "/campaign-reports", "/staff-notifications")
    ):
        if method in ("GET", "HEAD") or path.startswith("/staff-notifications"):
            return "read"
        if path.endswith("/review"):
            return "campaign_review"
        if (
            path.endswith("/schedule")
            or path.endswith("/consent")
            or path.endswith("/products")
        ):
            return "campaign_admin"
        return "campaign_run"
    if path in ("/session", "/conversations", "/evidence") or method in ("GET", "HEAD"):
        return "read"
    if path == "/customers" or path == "/approvals":
        return "form_submit"
    if path.startswith("/approvals/"):
        return "approval_review"
    if (
        path.startswith("/data/customers")
        or path in ("/data/imports/confirm", "/data/imports/apply")
        or path.startswith("/preferences/")
        or path.startswith("/maintenance/")
        or path.startswith("/kyc/")
    ):
        return "customer_write"
    if path == "/forms" or path.startswith("/forms/"):
        return "form_read"
    return "analyze"


def audit_access(identity, method, path, status):
    from backend.core.database import connect
    from backend.core.identifiers import identifier, now

    with connect() as db:
        db.execute(
            "INSERT INTO access_audit VALUES(?,?,?,?,?,?,?)",
            (
                identifier("ACCESS"),
                identity.actor_id,
                identity.role,
                method,
                path[:200],
                status,
                now(),
            ),
        )


def identity_payload():
    identity = actor()
    return dict(
        actorId=identity.actor_id,
        role=identity.role,
        tenant=identity.tenant,
        adapter=identity.adapter,
        permissions=sorted(PERMISSIONS[identity.role]),
        environment=os.environ.get("RISKLENS_ENV", "development"),
    )
