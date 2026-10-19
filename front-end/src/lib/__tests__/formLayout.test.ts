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
