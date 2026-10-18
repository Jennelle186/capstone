import { describe, expect, it } from "vitest";

import {
    fieldsToBlocks,
    hasUnresolvedBlocks,
    isPersistable,
    parseStructuredDocument,
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
