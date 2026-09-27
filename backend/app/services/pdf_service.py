"""PDF utilities for Feature 3 (Compiled PDF Splitting).

Pure functions built on PyMuPDF (``pymupdf``). No I/O beyond decoding the
supplied bytes, so they are unit-testable against in-memory PDFs.
"""
from __future__ import annotations

from dataclasses import dataclass

import pymupdf

# Upper bound on how many pages a single PDF may contain before processing is
# rejected. Guards against pathological uploads (hundreds/thousands of pages)
# that would exhaust CPU and memory during rasterization.
MAX_PDF_PAGES = 100


def count_pages(content: bytes) -> int:
    with pymupdf.open(stream=content, filetype="pdf") as doc:
        return doc.page_count


def normalize_to_pages(content: bytes, mime_type: str) -> list[bytes]:
    """Normalize a PDF or single image to a list of per-page JPEG bytes.

    PDFs are rasterized one page at a time at 150 dpi so the same
    classification code path serves both input types. JPEG (quality 80) is
    used instead of PNG to keep the inline payload small — page classification
    only needs enough fidelity to read the document type, not lossless text.
    A non-PDF input is treated as a single already-rasterized page.
    """
    if mime_type == "application/pdf":
        with pymupdf.open(stream=content, filetype="pdf") as doc:
            if doc.page_count > MAX_PDF_PAGES:
                raise ValueError(
                    f"PDF has {doc.page_count} pages; maximum allowed is {MAX_PDF_PAGES}"
                )
            return [
                page.get_pixmap(dpi=150).tobytes("jpeg", jpg_quality=80)
                for page in doc
            ]
    return [content]


@dataclass
class CompiledSegment:
    """One split output: a document type plus the (possibly non-contiguous)
    page ranges that classify to it. ``ranges`` are inclusive, 0-indexed
    ``(start, end)`` pairs.
    """

    type_code: str
    ranges: list[tuple[int, int]]

    @property
    def page_count(self) -> int:
        return sum(end - start + 1 for start, end in self.ranges)


def split_pdf_by_groups(
    content: bytes,
    segments: list[CompiledSegment],
) -> list[bytes]:
    """Split a PDF into one PDF per compiled segment.

    Returns a list of PDF byte strings aligned 1:1 with ``segments``. Each
    segment may span multiple non-contiguous page ranges; each range is
    ``insert_pdf``-ed into the same child document.
    """
    src = pymupdf.open(stream=content, filetype="pdf")
    try:
        outputs: list[bytes] = []
        for segment in segments:
            child = pymupdf.open()
            try:
                for start, end in segment.ranges:
                    child.insert_pdf(src, from_page=start, to_page=end)
                outputs.append(child.tobytes())
            finally:
                child.close()
        return outputs
    finally:
        src.close()


@dataclass
class PageClassification:
    page_index: int
    type_code: str | None
    confidence: float


def group_contiguous_pages(
    classifications: list[PageClassification],
) -> list[tuple[int, int, str]]:
    """Group consecutive pages sharing the same ``type_code``.

    Returns a list of ``(start_page, end_page, type_code)`` inclusive,
    0-indexed. Pages with a null ``type_code`` become ``"unclassified"`` runs
    (and are later FLAGGED for manual review downstream).
    """
    groups: list[tuple[int, int, str]] = []
    if not classifications:
        return groups

    start = 0
    current_type = classifications[0].type_code or "unclassified"
    for i in range(1, len(classifications)):
        next_type = classifications[i].type_code or "unclassified"
        if next_type != current_type:
            groups.append((start, i - 1, current_type))
            start = i
            current_type = next_type
    groups.append((start, len(classifications) - 1, current_type))
    return groups


def merge_groups_by_type(
    groups: list[tuple[int, int, str]],
) -> list[CompiledSegment]:
    """Coalesce non-contiguous runs of the same type into one segment.

    Preserves first-occurrence order so ``segment_index`` stays stable.
    """
    merged: dict[str, list[tuple[int, int]]] = {}
    order: list[str] = []
    for start, end, type_code in groups:
        if type_code not in merged:
            merged[type_code] = []
            order.append(type_code)
        merged[type_code].append((start, end))
    return [CompiledSegment(type_code=t, ranges=merged[t]) for t in order]


def detect_compiled_document(
    classifications: list[PageClassification],
) -> tuple[bool, list[CompiledSegment]]:
    """Return ``(is_compiled, segments)``.

    ``is_compiled`` is True only when pages span more than one *distinct,
    non-null* document type — mirroring the single-document fallthrough: a
    "compiled" upload that is actually all one type classifies normally.

    Note: this treats "every page classified the same" as *not compiled*. A
    genuinely multi-document PDF can still land here if the per-page classifier
    labels every page identically — typically because the document-type list
    offered to the model is missing the other types (see the
    ``classify_page_images`` log line listing the types).

    Non-contiguous runs of the same type are merged into a single segment, so
    children always carry unique document types (A…B…A becomes one A segment
    with ranges 0-1 & 4-4 plus one B segment).
    """
    groups = group_contiguous_pages(classifications)
    segments = merge_groups_by_type(groups)
    distinct_real_types = {c.type_code for c in classifications if c.type_code}
    return len(distinct_real_types) > 1, segments
