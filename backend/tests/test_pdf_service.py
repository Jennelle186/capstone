from __future__ import annotations

import pymupdf

from app.services.pdf_service import (
    CompiledSegment,
    PageClassification,
    count_pages,
    detect_compiled_document,
    group_contiguous_pages,
    merge_groups_by_type,
    normalize_to_pages,
    split_pdf_by_groups,
)


def _make_pdf(num_pages: int) -> bytes:
    doc = pymupdf.open()
    try:
        for _ in range(num_pages):
            doc.new_page()
        return doc.tobytes()
    finally:
        doc.close()


def _pages(*types: str | None) -> list[PageClassification]:
    return [
        PageClassification(page_index=i, type_code=t, confidence=0.9)
        for i, t in enumerate(types)
    ]


def test_count_pages() -> None:
    assert count_pages(_make_pdf(3)) == 3


def test_normalize_to_pages_pdf() -> None:
    images = normalize_to_pages(_make_pdf(2), "application/pdf")
    assert len(images) == 2
    for img in images:
        assert img.startswith(b"\xff\xd8")  # JPEG magic


def test_normalize_to_pages_single_image() -> None:
    raw = b"not-a-real-image"
    assert normalize_to_pages(raw, "image/jpeg") == [raw]


def test_split_pdf_by_groups() -> None:
    content = _make_pdf(4)
    segments = [
        CompiledSegment(type_code="a", ranges=[(0, 1)]),
        CompiledSegment(type_code="b", ranges=[(2, 3)]),
    ]
    parts = split_pdf_by_groups(content, segments)
    assert len(parts) == 2
    assert count_pages(parts[0]) == 2
    assert count_pages(parts[1]) == 2


def test_split_pdf_by_groups_multi_range() -> None:
    content = _make_pdf(6)
    segments = [
        CompiledSegment(type_code="a", ranges=[(0, 1), (4, 5)]),
        CompiledSegment(type_code="b", ranges=[(2, 3)]),
    ]
    parts = split_pdf_by_groups(content, segments)
    assert len(parts) == 2
    assert count_pages(parts[0]) == 4  # pages 0-1 and 4-5
    assert count_pages(parts[1]) == 2


def test_group_contiguous_pages() -> None:
    groups = group_contiguous_pages(_pages("a", "a", "b", "b", "a"))
    assert groups == [(0, 1, "a"), (2, 3, "b"), (4, 4, "a")]


def test_group_contiguous_pages_null_becomes_unclassified() -> None:
    groups = group_contiguous_pages(_pages("a", None, "a"))
    assert groups == [(0, 0, "a"), (1, 1, "unclassified"), (2, 2, "a")]


def test_merge_groups_by_type() -> None:
    groups = [(0, 1, "a"), (2, 3, "b"), (4, 4, "a")]
    segments = merge_groups_by_type(groups)
    assert [(s.type_code, s.ranges) for s in segments] == [
        ("a", [(0, 1), (4, 4)]),
        ("b", [(2, 3)]),
    ]


def test_detect_compiled_single_type_returns_false() -> None:
    is_compiled, segments = detect_compiled_document(_pages("a", "a", "a"))
    assert is_compiled is False
    assert [(s.type_code, s.ranges) for s in segments] == [("a", [(0, 2)])]


def test_detect_compiled_multi_type_returns_true() -> None:
    is_compiled, segments = detect_compiled_document(_pages("a", "a", "b"))
    assert is_compiled is True
    assert [(s.type_code, s.ranges) for s in segments] == [
        ("a", [(0, 1)]),
        ("b", [(2, 2)]),
    ]


def test_detect_compiled_merges_noncontiguous_same_type() -> None:
    is_compiled, segments = detect_compiled_document(_pages("a", "b", "a"))
    assert is_compiled is True
    assert [(s.type_code, s.ranges) for s in segments] == [
        ("a", [(0, 0), (2, 2)]),
        ("b", [(1, 1)]),
    ]


def test_detect_compiled_ignores_null_for_is_compiled() -> None:
    is_compiled, _ = detect_compiled_document(_pages("a", None, "a"))
    assert is_compiled is False
