import { z } from "zod";

import type {
    FieldNodeAttrs,
    FormFieldSpec,
    FormLayoutSection,
    StructuredFormDocument,
} from "@/types/form";

export function makeId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
}

export function toFieldKey(label: string): string {
    const key = label
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]+/g, "_")
        .replace(/^_+|_+$/g, "");
    return key || "field";
}

export function createField(partial?: Partial<FieldNodeAttrs>): FormFieldSpec {
    const label = partial?.label ?? "New field";
    return {
        id: makeId(),
        field_key: partial?.field_key ?? toFieldKey(label),
        label,
        ui_component: partial?.ui_component ?? "text_input",
        required: partial?.required ?? false,
        options: partial?.options ?? null,
    };
}

export function createSection(heading = "New Section"): FormLayoutSection {
    return { id: makeId(), heading, fields: [] };
}

export function createEmptyStructuredDocument(): StructuredFormDocument {
    return {
        version: 1,
        creation_mode: "structured",
        title: "Untitled Form",
        subtitle: "",
        instructions: "",
        sections: [],
        signatureLabel: "Signature over Printed Name",
        footer: "",
    };
}

function mapSection(
    doc: StructuredFormDocument,
    sectionId: string,
    fn: (section: FormLayoutSection) => FormLayoutSection,
): StructuredFormDocument {
    return { ...doc, sections: doc.sections.map((s) => (s.id === sectionId ? fn(s) : s)) };
}

export function replaceSection(doc: StructuredFormDocument, next: FormLayoutSection): StructuredFormDocument {
    return mapSection(doc, next.id, () => next);
}

export function renameSection(doc: StructuredFormDocument, sectionId: string, heading: string): StructuredFormDocument {
    return mapSection(doc, sectionId, (s) => ({ ...s, heading }));
}

export function addSection(doc: StructuredFormDocument): StructuredFormDocument {
    return { ...doc, sections: [...doc.sections, createSection()] };
}

export function removeSection(doc: StructuredFormDocument, sectionId: string): StructuredFormDocument {
    return { ...doc, sections: doc.sections.filter((s) => s.id !== sectionId) };
}

export function moveSection(doc: StructuredFormDocument, sectionId: string, direction: -1 | 1): StructuredFormDocument {
    const index = doc.sections.findIndex((s) => s.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= doc.sections.length) return doc;
    const sections = [...doc.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    return { ...doc, sections };
}

// ── Runtime guard for persisted documents ──────────────────────────────
//
// `document_json` is stored as free JSONB, so rows may predate the structured
// shape (e.g. the old TipTap documents). Parse on load and reject anything that
// is not a v1 structured document instead of letting it crash the renderer.

const fieldOptionSchema = z.object({
    value: z.string(),
    label: z.string(),
});

const formFieldSchema = z.object({
    id: z.string(),
    field_key: z.string(),
    label: z.string(),
    ui_component: z.enum(["text_input", "radio_group", "checkbox_group", "dropdown", "date_picker"]),
    required: z.boolean(),
    options: z.array(fieldOptionSchema).nullable(),
});

const formSectionSchema = z.object({
    id: z.string(),
    heading: z.string(),
    fields: z.array(formFieldSchema),
});

export const structuredFormDocumentSchema = z.object({
    version: z.literal(1),
    creation_mode: z.literal("structured"),
    title: z.string(),
    subtitle: z.string().optional(),
    instructions: z.string().optional(),
    sections: z.array(formSectionSchema),
    signatureLabel: z.string(),
    footer: z.string().optional(),
});

export function parseStructuredDocument(value: unknown): StructuredFormDocument | null {
    const result = structuredFormDocumentSchema.safeParse(value);
    return result.success ? (result.data as StructuredFormDocument) : null;
}
