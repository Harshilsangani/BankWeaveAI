"""Opt-in signed IAP identity with explicit server-side, single-tenant grants."""

import hashlib
import json
import os
import threading
import time
import urllib.request
from pathlib import Path
from typing import Literal

from google.auth import jwt
from pydantic import BaseModel, ConfigDict, Field

IAP_ISSUER = "https://cloud.google.com/iap"
IAP_KEYS_URL = "https://www.gstatic.com/iap/verify/public_key"


class StaffGrant(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    subject: str = Field(min_length=1, max_length=256)
    email: str = Field(min_length=3, max_length=254)
    role: Literal["viewer", "analyst", "admin"]
    # Banking tables currently represent one shared demo bank. Do not accept
    # another tenant before tenant-scoped banking persistence is implemented.
    tenant: Literal["meridian-demo"]


class GrantFile(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: Literal[1]
    staff: list[StaffGrant] = Field(max_length=500)


class PublicKeys:
    def __init__(self):
        self._lock = threading.Lock()
        self._keys = {}
        self._fetched = 0

    def get(self, key_id):
        with self._lock:
            age = time.monotonic() - self._fetched
            if not self._keys or age >= 300 or (key_id not in self._keys and age >= 30):
                request = urllib.request.Request(
                    IAP_KEYS_URL, headers={"User-Agent": "BankWeave-IAP"}
                )
                with urllib.request.urlopen(request, timeout=5) as response:
                    raw = response.read(65537)
                if len(raw) > 65536:
                    raise ValueError("Public key response exceeded its limit.")
                keys = json.loads(raw)
                if (
                    not isinstance(keys, dict)
                    or not keys
                    or not all(isinstance(value, str) for value in keys.values())
                ):
                    raise ValueError("Invalid IAP public key response.")
                self._keys, self._fetched = keys, time.monotonic()
            return self._keys


class IAPIdentity:
    def __init__(self, keys=None):
        self.keys = keys or PublicKeys()

    def resolve(self, request):
        from backend.core.security import Identity

        audience = os.environ.get("RISKLENS_IAP_AUDIENCE", "")
        grant_path = os.environ.get("RISKLENS_STAFF_GRANTS_FILE", "")
        if not audience or not grant_path or not Path(grant_path).is_absolute():
            raise PermissionError(
                "Verified staff identity requires an IAP audience and an absolute private grants-file path."
            )
        token = request.headers.get("x-goog-iap-jwt-assertion", "")
        if not token or len(token) > 16384:
            raise PermissionError("A signed staff identity is required.")
        try:
            header = jwt.decode_header(token)
            if (
                header.get("alg") != "ES256"
                or not isinstance(header.get("kid"), str)
                or not header["kid"]
            ):
                raise ValueError("Unsupported token header.")
            claims = jwt.decode(
                token,
                certs=self.keys.get(header["kid"]),
                audience=audience,
                clock_skew_in_seconds=30,
            )
            if claims.get("iss") != IAP_ISSUER or claims.get("aud") != audience:
                raise ValueError("Invalid issuer or audience.")
            if any(type(claims.get(name)) is not int for name in ("iat", "exp")):
                raise ValueError("Invalid token times.")
            if not 0 < claims["exp"] - claims["iat"] <= 660:
                raise ValueError("Invalid token lifetime.")
            subject, email = claims.get("sub"), claims.get("email")
            if not isinstance(subject, str) or not subject or len(subject) > 256:
                raise ValueError("Missing staff subject.")
            if not isinstance(email, str) or "@" not in email or len(email) > 254:
                raise ValueError("Missing staff email.")
        except Exception:
            # Library errors can contain token/payload details. Never return
            # them to the browser or include signed credentials in logs.
            raise PermissionError(
                "The signed staff identity could not be verified."
            ) from None

        try:
            with Path(grant_path).open("rb") as file:
                raw = file.read(262145)
            if len(raw) > 262144:
                raise ValueError("Grants file exceeded its limit.")
            grants = GrantFile.model_validate_json(raw)
            subjects = [grant.subject for grant in grants.staff]
            if len(set(subjects)) != len(subjects):
                raise ValueError("Duplicate staff subjects.")
        except Exception:
            raise PermissionError(
                "Verified staff grants are not configured correctly."
            ) from None

        grant = next(
            (value for value in grants.staff if value.subject == subject), None
        )
        if grant is None or grant.email.casefold() != email.casefold():
            raise PermissionError(
                "This staff identity has no authorized banking grant."
            )
        # Role/tenant come only from server grants. Browser role headers and
        # extra JWT claims cannot select privileges or legacy actors.
        actor_id = "iap-" + hashlib.sha256(subject.encode()).hexdigest()
        return Identity(actor_id, grant.role, tenant=grant.tenant, adapter="iap")
