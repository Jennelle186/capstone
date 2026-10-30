"""Versioned, structured form ``document_json`` contract (v1).

This module is the **authoritative** backend contract for the structured form
layout. The frontend mirrors the same shape in ``lib/formLayout.ts`` (zod), which
is fast-feedback only — enforcement happens here, on create/update/generate.

Backward compatibility (v1):
- Existing saved documents use ``sections[].fields[]`` (legacy). New documents use
  ``sections[].blocks[]`` (authoritative). Both are accepted on read; on save the
  editor normalizes ``fields[]`` into ``blocks[]``.
- ``unresolved_field`` blocks are parseable but must **never** be persisted —
  ``validate_persistable`` rejects them. They exist only on the generate response
  so the admin can map or delete invented field keys before saving.
"""

from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field, ValidationError, model_validator

UiComponent = Literal["text_input", "radio_group", "checkbox_group", "dropdown", "date_picker"]
PageSize = Literal["A4", "Letter"]
Orientation = Literal["portrait", "landscape"]
Alignment = Literal["left", "center", "right", "justify"]


def create_empty_document() -> dict[str, Any]:
    """Canonical empty v1 structured document."""
    return {
        "version": 1,
        "creation_mode": "structured",
        "title": "Untitled Form",
        "subtitle": "",
        "instructions": "",
        "sections": [],
        "signatureLabel": "Signature over Printed Name",
        "footer": "",
    }


# ── Shared leaf models ───────────────────────────────────────────────────


class FieldOption(BaseModel):
    value: str
    label: str


class TextStyle(BaseModel):
    fontSize: int | None = Field(default=None, ge=6, le=72)
    bold: bool = False
    italic: bool = False
    align: Alignment | None = None
    spacing: int | None = Field(default=None, ge=0, le=48)


class Letterhead(BaseModel):
    """Per-form text overrides. The logo itself is global (Settings → Branding)."""

    institutionName: str | None = None
    addressLines: list[str] = Field(default_factory=list)
    contactLine: str | None = None
    formNumber: str | None = None


class PageMargins(BaseModel):
    top: float = Field(default=14, ge=0, le=50)
    right: float = Field(default=16, ge=0, le=50)
    bottom: float = Field(default=14, ge=0, le=50)
    left: float = Field(default=16, ge=0, le=50)


class PageSettings(BaseModel):
    size: PageSize = "A4"
    orientation: Orientation = "portrait"
    margins: PageMargins = Field(default_factory=PageMargins)
    # Additive v1 key: scale the printed form down so it fits on a single page.
    fitToPage: bool = False


# ── Legacy field spec (``sections[].fields[]``) ──────────────────────────


class FieldSpec(BaseModel):
    """A field as stored in the legacy ``fields[]`` list (no ``type`` key)."""

    id: str = Field(min_length=1)
    field_key: str = Field(min_length=1, max_length=120)
    label: str = ""
    ui_component: UiComponent = "text_input"
    required: bool = False
    options: list[FieldOption] | None = None


# ── Blocks (``sections[].blocks[]``) ─────────────────────────────────────


class FieldBlock(BaseModel):
    type: Literal["field"] = "field"
    id: str = Field(min_length=1)
    field_key: str = Field(min_length=1, max_length=120)
    label: str = ""
    ui_component: UiComponent = "text_input"
    required: bool = False
    options: list[FieldOption] | None = None
    columnSpan: int = Field(default=1, ge=1, le=12)
    pageBreakBefore: bool = False
    style: TextStyle | None = None


class ParagraphBlock(BaseModel):
    type: Literal["paragraph"] = "paragraph"
    id: str = Field(min_length=1)
    text: str = ""
    style: TextStyle | None = None
    pageBreakBefore: bool = False


class TableBlock(BaseModel):
    type: Literal["table"] = "table"
    id: str = Field(min_length=1)
    columns: int = Field(default=2, ge=1, le=12)
    rows: list[list[str]] = Field(default_factory=list)
    columnWidths: list[str] | None = None
    # Render the first row as a repeating header in print output.
    headerRow: bool = False
    pageBreakBefore: bool = False


class SignatureBlock(BaseModel):
    type: Literal["signature"] = "signature"
    id: str = Field(min_length=1)
    label: str = "Signature over Printed Name"
    pageBreakBefore: bool = False


class UnresolvedFieldBlock(BaseModel):
    """A field key invented by the AI that has no matching configured field.

    Transient: emitted on the generate response only. ``validate_persistable``
    rejects any document containing one.
    """

    type: Literal["unresolved_field"] = "unresolved_field"
    id: str = Field(min_length=1)
    field_key: str = Field(min_length=1, max_length=120)
    label: str = ""


FormBlock = Annotated[
    Union[FieldBlock, ParagraphBlock, TableBlock, SignatureBlock, UnresolvedFieldBlock],
    Field(discriminator="type"),
]


# ── Section + document ───────────────────────────────────────────────────


class FormSection(BaseModel):
    id: str = Field(min_length=1)
    heading: str = ""
    # `blocks` is authoritative for new documents; `fields` is the legacy key.
    blocks: list[FormBlock] = Field(default_factory=list)
    fields: list[FieldSpec] = Field(default_factory=list)


class StructuredFormDocument(BaseModel):
    version: Literal[1] = 1
    creation_mode: Literal["structured"] = "structured"
    title: str = "Untitled Form"
    subtitle: str | None = None
    instructions: str | None = None
    letterhead: Letterhead | None = None
    page: PageSettings | None = None
    sections: list[FormSection] = Field(default_factory=list)
    signatureLabel: str = "Signature over Printed Name"
    footer: str | None = None

    @model_validator(mode="after")
    def _validate_unique_field_keys(self) -> "StructuredFormDocument":
        seen: set[str] = set()
        for section in self.sections:
            for block in section.blocks:
                if isinstance(block, (FieldBlock, UnresolvedFieldBlock)):
                    key = _normalize_key(block.field_key)
                    if not key:
                        raise ValueError("Field key must not be empty.")
                    if key in seen:
                        raise ValueError(f"Duplicate field key: {block.field_key}")
                    seen.add(key)
        return self


def _normalize_key(value: str) -> str:
    return value.strip().lower()


# ── Parsing / validation helpers ─────────────────────────────────────────


def parse_structured_document(value: Any) -> StructuredFormDocument | None:
    """Lenient read-side parse. Returns ``None`` on any validation error."""
    try:
        return StructuredFormDocument.model_validate(value)
    except ValidationError:
        return None


def has_unresolved_blocks(doc: StructuredFormDocument) -> bool:
    return any(
        isinstance(block, UnresolvedFieldBlock)
        for section in doc.sections
        for block in section.blocks
    )


def validate_persistable(value: Any) -> StructuredFormDocument:
    """Parse and reject documents that must not be persisted.

    Raises ``pydantic.ValidationError`` for a structurally invalid document, and
    ``ValueError`` for a valid document containing unresolved field blocks.
    """
    doc = StructuredFormDocument.model_validate(value)
    if has_unresolved_blocks(doc):
        raise ValueError(
            "Document contains unresolved field blocks; map or delete them before saving."
        )
    return doc
