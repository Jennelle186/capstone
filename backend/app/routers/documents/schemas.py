from fastapi import Depends
from pydantic import BaseModel
from typing_extensions import Annotated

from ...rbac import require_student

StudentClaims = Annotated[dict, Depends(require_student)]


class SubmissionDetailResponse(BaseModel):
    id: str
    status: str
    file_key: str
    original_filename: str
    file_size: str | None = None
    mime_type: str | None = None
    is_compiled: bool
    document_type_id: str | None = None
    document_type_name: str | None = None
    document_type_code: str | None = None
    classification_result: dict | None = None
    extracted_data: dict | None = None
    rejection_reason: str | None = None
    created_at: str
