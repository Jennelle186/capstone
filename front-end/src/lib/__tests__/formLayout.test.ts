import { describe, expect, it } from "vitest";

import {
    DEFAULT_PAGE_SETTINGS,
    fieldsToBlocks,
    hasUnresolvedBlocks,
    isPersistable,
    normalizePageSettings,
    parseStructuredDocument,
    setBlockColumnSpan,
    setBlockPageBreak,
    updatePageSettings,
} from "@/lib/formLayout";

const legacyDoc = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    sections: [
        {
            id: "sec-1",
            heading: "PERSONAL",
            fields: [
                {
                    id: "f1",
                    field_key: "full_name",
                    label: "Full Name",
                    ui_component: "text_input",
                    required: true,
                    options: null,
                },
            ],
        },
    ],
    signatureLabel: "Signature over Printed Name",
};

const blocksDoc = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    sections: [
        {
            id: "s1",
            heading: "Personal",
            blocks: [
                { type: "paragraph", id: "p1", text: "Instructions." },
                {
                    type: "field",
                    id: "b1",
                    field_key: "full_name",
                    label: "Full Name",
                    ui_component: "text_input",
                    required: true,
                    options: null,
                },
            ],
            fields: [],
        },
    ],
    signatureLabel: "Signature over Printed Name",
};

const unresolvedDoc = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    sections: [
        {
            id: "s1",
            heading: "Personal",
            blocks: [{ type: "unresolved_field", id: "u1", field_key: "invented", label: "Invented" }],
        },
    ],
    signatureLabel: "Signature over Printed Name",
};

describe("parseStructuredDocument", () => {
    it("parses a legacy fields-only v1 document", () => {
        const doc = parseStructuredDocument(legacyDoc);
        expect(doc).not.toBeNull();
        expect(doc!.sections[0].fields[0].field_key).toBe("full_name");
    });

    it("parses a blocks document", () => {
        const doc = parseStructuredDocument(blocksDoc);
        expect(doc).not.toBeNull();
        expect(doc!.sections[0].blocks![0].type).toBe("paragraph");
    });

    it("rejects a non-v1 / non-structured document", () => {
        expect(parseStructuredDocument({ version: 2, creation_mode: "structured" })).toBeNull();
        expect(parseStructuredDocument({ version: 1, creation_mode: "pdf_overlay" })).toBeNull();
    });
});

describe("fieldsToBlocks", () => {
    it("converts legacy fields to field blocks and clears fields", () => {
        const doc = parseStructuredDocument(legacyDoc)!;
        const normalized = fieldsToBlocks(doc);
        expect(normalized.sections[0].fields).toEqual([]);
        expect(normalized.sections[0].blocks![0]).toMatchObject({
            type: "field",
            field_key: "full_name",
            required: true,
        });
    });

    it("keeps existing blocks and drops legacy fields (blocks win, never merge)", () => {
        const doc = parseStructuredDocument({
            ...blocksDoc,
            sections: [
                {
                    ...blocksDoc.sections[0],
                    fields: [
                        {
                            id: "stale",
                            field_key: "stale",
                            label: "drop me",
                            ui_component: "text_input",
                            required: false,
                            options: null,
                        },
                    ],
                },
            ],
        })!;
        const normalized = fieldsToBlocks(doc);
        expect(normalized.sections[0].fields).toEqual([]);
        expect(normalized.sections[0].blocks!.map((b) => b.type)).toEqual(["paragraph", "field"]);
    });
});

describe("unresolved detection", () => {
    it("flags unresolved blocks and blocks persistence", () => {
        const doc = parseStructuredDocument(unresolvedDoc)!;
        expect(hasUnresolvedBlocks(doc)).toBe(true);
        expect(isPersistable(doc)).toBe(false);
    });

    it("allows persistable documents", () => {
        expect(isPersistable(parseStructuredDocument(legacyDoc)!)).toBe(true);
        expect(isPersistable(parseStructuredDocument(blocksDoc)!)).toBe(true);
    });
});

describe("page settings", () => {
    it("defaults to A4 portrait when page is absent", () => {
        expect(normalizePageSettings(undefined)).toEqual(DEFAULT_PAGE_SETTINGS);
        expect(normalizePageSettings(null)).toEqual(DEFAULT_PAGE_SETTINGS);
    });

    it("clamps margins to the backend bounds (0–50mm)", () => {
        const page = normalizePageSettings({
            size: "Letter",
            orientation: "landscape",
            margins: { top: -5, right: 80, bottom: 12, left: 16 },
        });
        expect(page.size).toBe("Letter");
        expect(page.orientation).toBe("landscape");
        expect(page.margins).toEqual({ top: 0, right: 50, bottom: 12, left: 16 });
    });

    it("falls back to A4/portrait for unknown values", () => {
        const page = normalizePageSettings({
            size: "Legal" as unknown as "A4",
            orientation: "sideways" as unknown as "portrait",
        });
        expect(page.size).toBe("A4");
        expect(page.orientation).toBe("portrait");
    });

    it("defaults fit-to-page off and preserves it through normalization", () => {
        expect(normalizePageSettings(undefined).fitToPage).toBe(false);
        expect(
            normalizePageSettings({ size: "A4", orientation: "portrait", fitToPage: true }).fitToPage,
        ).toBe(true);

        const doc = parseStructuredDocument(blocksDoc)!;
        const next = updatePageSettings(doc, { fitToPage: true });
        expect(next.page!.fitToPage).toBe(true);
    });

    it("merges a partial margin patch without dropping other margins", () => {
        const doc = parseStructuredDocument(blocksDoc)!;
        const next = updatePageSettings(doc, { margins: { top: 25 } });
        expect(next.page!.margins).toEqual({ top: 25, right: 16, bottom: 14, left: 16 });
        expect(next.page!.size).toBe("A4");
    });

    it("preserves sections when changing page size", () => {
        const doc = parseStructuredDocument(blocksDoc)!;
        const next = updatePageSettings(doc, { size: "Letter", orientation: "landscape" });
        expect(next.sections).toEqual(doc.sections);
        expect(next.page!.size).toBe("Letter");
    });
});

describe("block layout controls", () => {
    it("clamps column span to 1–12 and only touches the target field", () => {
        const doc = parseStructuredDocument(blocksDoc)!;
        const next = setBlockColumnSpan(doc, "b1", 99);
        const blocks = next.sections[0].blocks!;
        expect(blocks[1]).toMatchObject({ id: "b1", columnSpan: 12 });
        expect(blocks[0]).toEqual(doc.sections[0].blocks![0]);
    });

    it("toggles pageBreakBefore on any block", () => {
        const doc = parseStructuredDocument(blocksDoc)!;
        const next = setBlockPageBreak(doc, "p1", true);
        expect(next.sections[0].blocks![0]).toMatchObject({ id: "p1", pageBreakBefore: true });
    });
});

// ── Phase 2D acceptance ────────────────────────────────────────────────

const generatedDoc = {
    version: 1,
    creation_mode: "structured",
    title: "Admission Form",
    subtitle: "First Semester",
    instructions: "Print legibly.",
    letterhead: {
        institutionName: "College of Computer Studies",
        addressLines: ["Campus Address", "City, Province"],
        contactLine: "registrar@example.edu",
        formNumber: "ADS-01",
    },
    page: { size: "A4", orientation: "portrait", margins: { top: 14, right: 16, bottom: 14, left: 16 } },
    sections: [
        {
            id: "s1",
            heading: "PERSONAL INFORMATION",
            fields: [],
            blocks: [
                { type: "paragraph", id: "p1", text: "Complete all fields.", style: { bold: true, fontSize: 11 } },
                {
                    type: "field",
                    id: "b1",
                    field_key: "full_name",
                    label: "Full Name",
                    ui_component: "text_input",
                    required: true,
                    options: null,
                    columnSpan: 2,
                    pageBreakBefore: false,
                },
                {
                    type: "field",
                    id: "b2",
                    field_key: "sex",
                    label: "Sex",
                    ui_component: "radio_group",
                    required: true,
                    options: [
                        { value: "male", label: "Male" },
                        { value: "female", label: "Female" },
                    ],
                },
                {
                    type: "table",
                    id: "t1",
                    columns: 2,
                    rows: [
                        ["School", "Year"],
                        ["WMSU", "2026"],
                    ],
                    columnWidths: ["60%", "40%"],
                    headerRow: true,
                    pageBreakBefore: true,
                },
                { type: "signature", id: "sig1", label: "Registrar" },
                { type: "unresolved_field", id: "u1", field_key: "invented_key", label: "Invented Key" },
            ],
        },
        {
            id: "s2",
            heading: "EDUCATION",
            fields: [],
            blocks: [
                {
                    type: "field",
                    id: "b3",
                    field_key: "school_name",
                    label: "School Name",
                    ui_component: "text_input",
                    required: false,
                    options: null,
                },
            ],
        },
    ],
    signatureLabel: "Signature over Printed Name",
    footer: "Office of the Registrar",
};

describe("2D: generated document opens in the editor", () => {
    it("parses a mixed generated document and keeps every block type", () => {
        const doc = parseStructuredDocument(generatedDoc);
        expect(doc).not.toBeNull();
        expect(doc!.sections).toHaveLength(2);
        expect(doc!.sections[0].blocks!.map((b) => b.type)).toEqual([
            "paragraph",
            "field",
            "field",
            "table",
            "signature",
            "unresolved_field",
        ]);
    });

    it("is not persistable while an unresolved block remains", () => {
        const doc = parseStructuredDocument(generatedDoc)!;
        expect(hasUnresolvedBlocks(doc)).toBe(true);
        expect(isPersistable(doc)).toBe(false);
    });

    it("becomes persistable once the unresolved block is removed", () => {
        const doc = parseStructuredDocument(generatedDoc)!;
        const resolved: typeof doc = {
            ...doc,
            sections: doc.sections.map((section) => ({
                ...section,
                blocks: (section.blocks ?? []).filter((b) => b.type !== "unresolved_field"),
            })),
        };
        expect(hasUnresolvedBlocks(resolved)).toBe(false);
        expect(isPersistable(resolved)).toBe(true);
    });

    it("preserves layout metadata through a parse → save round trip", () => {
        const doc = parseStructuredDocument(generatedDoc)!;
        const roundTripped = parseStructuredDocument(JSON.parse(JSON.stringify(doc)))!;
        const blocks = roundTripped.sections[0].blocks!;
        expect(blocks[1]).toMatchObject({ columnSpan: 2 });
        expect(blocks[3]).toMatchObject({ headerRow: true, columnWidths: ["60%", "40%"], pageBreakBefore: true });
        expect(roundTripped.page).toEqual(generatedDoc.page);
        expect(roundTripped.letterhead).toEqual(generatedDoc.letterhead);
    });

    it("rejects a document with an out-of-range columnSpan", () => {
        const invalid = JSON.parse(JSON.stringify(generatedDoc)) as typeof generatedDoc;
        (invalid.sections[0].blocks[1] as { columnSpan: number }).columnSpan = 13;
        expect(parseStructuredDocument(invalid)).toBeNull();
    });

    it("rejects a document with an invalid page size", () => {
        const invalid = JSON.parse(JSON.stringify(generatedDoc)) as typeof generatedDoc;
        (invalid.page as { size: string }).size = "Legal";
        expect(parseStructuredDocument(invalid)).toBeNull();
    });

    it("rejects a document with an out-of-bounds margin", () => {
        const invalid = JSON.parse(JSON.stringify(generatedDoc)) as typeof generatedDoc;
        (invalid.page!.margins as { top: number }).top = 80;
        expect(parseStructuredDocument(invalid)).toBeNull();
    });
});

describe("2D: legacy normalization fidelity", () => {
    it("preserves key, order, required flag and options when converting fields → blocks", () => {
        const legacy = {
            ...legacyDoc,
            sections: [
                {
                    id: "sec-1",
                    heading: "PERSONAL",
                    fields: [
                        {
                            id: "f1",
                            field_key: "full_name",
                            label: "Full Name",
                            ui_component: "text_input",
                            required: true,
                            options: null,
                        },
                        {
                            id: "f2",
                            field_key: "sex",
                            label: "Sex",
                            ui_component: "radio_group",
                            required: false,
                            options: [
                                { value: "male", label: "Male" },
                                { value: "female", label: "Female" },
                            ],
                        },
                        {
                            id: "f3",
                            field_key: "birth_date",
                            label: "Birth Date",
                            ui_component: "date_picker",
                            required: false,
                            options: null,
                        },
                    ],
                },
            ],
        };

        const doc = parseStructuredDocument(legacy)!;
        const normalized = fieldsToBlocks(doc);
        const blocks = normalized.sections[0].blocks!;

        expect(blocks.map((b) => b.id)).toEqual(["f1", "f2", "f3"]);
        expect(blocks.map((b) => (b.type === "field" ? b.field_key : null))).toEqual([
            "full_name",
            "sex",
            "birth_date",
        ]);
        expect(blocks[0]).toMatchObject({ type: "field", required: true, options: null });
        expect(blocks[1]).toMatchObject({
            type: "field",
            required: false,
            options: [
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
            ],
        });
        expect(blocks[2]).toMatchObject({ ui_component: "date_picker" });
    });

    it("keeps section order and headings stable", () => {
        const legacy = {
            ...legacyDoc,
            sections: [
                { id: "a", heading: "FIRST", fields: [] },
                { id: "b", heading: "SECOND", fields: [] },
                { id: "c", heading: "THIRD", fields: [] },
            ],
        };
        const normalized = fieldsToBlocks(parseStructuredDocument(legacy)!);
        expect(normalized.sections.map((s) => s.heading)).toEqual(["FIRST", "SECOND", "THIRD"]);
    });

    it("normalization is idempotent", () => {
        const once = fieldsToBlocks(parseStructuredDocument(legacyDoc)!);
        const twice = fieldsToBlocks(once);
        expect(twice).toEqual(once);
    });
});
