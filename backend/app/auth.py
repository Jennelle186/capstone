import logging
import os
from typing import Any, Annotated

from clerk_backend_api.security import verify_token
from clerk_backend_api.security.types import TokenVerificationError, VerifyTokenOptions
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

# Load backend/.env values for local development (e.g., CLERK_SECRET_KEY).
load_dotenv()

logger = logging.getLogger(__name__)

# Bearer auth parser for "Authorization: Bearer <token>" headers.
bearer_scheme = HTTPBearer(auto_error=False)


def _authorized_parties() -> list[str]:
    defaults = {
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    }
    configured = {
        party.strip()
        for party in os.getenv("CLERK_AUTHORIZED_PARTIES", "").split(",")
        if party.strip()
    }
    return sorted(defaults | configured)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict[str, Any]:
    # Reject missing or malformed bearer tokens.
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header.",
        )

    secret_key = os.getenv("CLERK_SECRET_KEY")
    if not secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Missing CLERK_SECRET_KEY in backend environment.",
        )

    # Tie token verification to your frontend origin to reduce token replay risk.
    jwt_key = os.getenv("CLERK_JWT_KEY")
    if jwt_key:
        # Support .env values that store PEM newlines as "\n".
        jwt_key = jwt_key.replace("\\n", "\n")
    options = VerifyTokenOptions(
        secret_key=secret_key,
        jwt_key=jwt_key,
        authorized_parties=_authorized_parties(),
    )

    try:
        return verify_token(credentials.credentials, options)
    except TokenVerificationError as error:
        logger.warning("Clerk token verification failed: %s", error)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Clerk token: {error}",
        ) from error
    

CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]

