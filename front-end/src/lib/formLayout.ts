import { z } from "zod";
import type { CSSProperties } from "react";

import type {
    FieldNodeAttrs,
    FieldBlock,
    FormBlock,
    FormFieldSpec,
    FormLayoutSection,
    StructuredFormDocument,
    TextStyle,
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

export function createFieldBlock(partial?: Partial<FieldNodeAttrs> & { style?: TextStyle | null }): FieldBlock {
    return { type: "field", ...createField(partial), style: partial?.style ?? null };
}

export function textStyleToCss(style: TextStyle | null | undefined): CSSProperties {
    if (!style) return {};
    return {
        fontSize: style.fontSize ?? undefined,
        fontWeight: style.bold ? 700 : undefined,
        fontStyle: style.italic ? "italic" : undefined,
        textAlign: style.align ?? undefined,
        lineHeight: style.spacing ? `${style.spacing}px` : undefined,
    };
}

function clampNumber(value: number, min: number, max: number): number {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

export function applyStyleToBlocks(
    doc: StructuredFormDocument,
    ids: Set<string>,
    patch: Partial<TextStyle>,
): StructuredFormDocument {
    return {
        ...doc,
        sections: doc.sections.map((section) => ({
            ...section,
            blocks: (section.blocks ?? []).map((block) => {
                if (block.type !== "field" || !ids.has(block.id)) return block;
                const style: TextStyle = { ...(block.style ?? {}), ...patch };
                if (style.fontSize != null) style.fontSize = clampNumber(style.fontSize, 6, 72);
                if (style.spacing != null) style.spacing = clampNumber(style.spacing, 0, 48);
                return { ...block, style };
            }),
        })),
    };
}

export function getSelectedStyle(doc: StructuredFormDocument, ids: Set<string>): Partial<TextStyle> {
    const styles: TextStyle[] = [];
    for (const section of doc.sections) {
        for (const block of section.blocks ?? []) {
            if (block.type === "field" && ids.has(block.id)) styles.push(block.style ?? {});
        }
    }
    if (styles.length === 0) return {};

    const first = styles[0];
    const result: Partial<TextStyle> = {};
    if (styles.every((s) => s.fontSize === first.fontSize)) result.fontSize = first.fontSize ?? null;
    if (styles.every((s) => s.bold === first.bold)) result.bold = first.bold ?? false;
    if (styles.every((s) => s.italic === first.italic)) result.italic = first.italic ?? false;
    if (styles.every((s) => s.align === first.align)) result.align = first.align ?? null;
    if (styles.every((s) => s.spacing === first.spacing)) result.spacing = first.spacing ?? null;
    return result;
}

export function createSection(heading = "New Section"): FormLayoutSection {
    return { id: makeId(), heading, fields: [], blocks: [] };
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

const textStyleSchema = z.object({
    fontSize: z.number().int().min(6).max(72).nullable().optional(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    align: z.enum(["left", "center", "right", "justify"]).nullable().optional(),
    spacing: z.number().int().min(0).max(48).nullable().optional(),
});

const fieldBlockSchema = z.object({
    type: z.literal("field"),
    id: z.string(),
    field_key: z.string(),
    label: z.string(),
    ui_component: z.enum(["text_input", "radio_group", "checkbox_group", "dropdown", "date_picker"]),
    required: z.boolean(),
    options: z.array(fieldOptionSchema).nullable(),
    columnSpan: z.number().int().min(1).max(12).optional(),
    pageBreakBefore: z.boolean().optional(),
    style: textStyleSchema.nullable().optional(),
});

const paragraphBlockSchema = z.object({
    type: z.literal("paragraph"),
    id: z.string(),
    text: z.string(),
    style: textStyleSchema.nullable().optional(),
    pageBreakBefore: z.boolean().optional(),
});

const tableBlockSchema = z.object({
    type: z.literal("table"),
    id: z.string(),
    columns: z.number().int().min(1).max(12),
    rows: z.array(z.array(z.string())),
    columnWidths: z.array(z.string()).nullable().optional(),
    pageBreakBefore: z.boolean().optional(),
});

const signatureBlockSchema = z.object({
    type: z.literal("signature"),
    id: z.string(),
    label: z.string(),
    pageBreakBefore: z.boolean().optional(),
});

const unresolvedFieldBlockSchema = z.object({
    type: z.literal("unresolved_field"),
    id: z.string(),
    field_key: z.string(),
    label: z.string(),
});

const formBlockSchema = z.discriminatedUnion("type", [
    fieldBlockSchema,
    paragraphBlockSchema,
    tableBlockSchema,
    signatureBlockSchema,
    unresolvedFieldBlockSchema,
]);

const letterheadSchema = z.object({
    institutionName: z.string().nullable().optional(),
    addressLines: z.array(z.string()).optional(),
    contactLine: z.string().nullable().optional(),
    formNumber: z.string().nullable().optional(),
});

const pageMarginsSchema = z.object({
    top: z.number().min(0).max(50),
    right: z.number().min(0).max(50),
    bottom: z.number().min(0).max(50),
    left: z.number().min(0).max(50),
});

const pageSettingsSchema = z.object({
    size: z.enum(["A4", "Letter"]),
    orientation: z.enum(["portrait", "landscape"]),
    margins: pageMarginsSchema.optional(),
});

const formSectionSchema = z.object({
    id: z.string(),
    heading: z.string(),
    fields: z.array(formFieldSchema).default([]),
    blocks: z.array(formBlockSchema).default([]),
});

export const structuredFormDocumentSchema = z.object({
    version: z.literal(1),
    creation_mode: z.literal("structured"),
    title: z.string(),
    subtitle: z.string().optional(),
    instructions: z.string().optional(),
    letterhead: letterheadSchema.nullable().optional(),
    page: pageSettingsSchema.nullable().optional(),
    sections: z.array(formSectionSchema),
    signatureLabel: z.string(),
    footer: z.string().optional(),
});

export function parseStructuredDocument(value: unknown): StructuredFormDocument | null {
    const result = structuredFormDocumentSchema.safeParse(value);
    return result.success ? (result.data as StructuredFormDocument) : null;
}

// ── Normalization + persist gate ────────────────────────────────────────

export function fieldsToBlocks(doc: StructuredFormDocument): StructuredFormDocument {
    return {
        ...doc,
        sections: doc.sections.map((section) => {
            if (section.blocks && section.blocks.length > 0) {
                // Blocks are authoritative — drop the legacy fields list.
                return { ...section, fields: [] };
            }
            const blocks: FormBlock[] = section.fields.map((field) => ({ type: "field", ...field }));
            return { ...section, blocks, fields: [] };
        }),
    };
}

export function hasUnresolvedBlocks(doc: StructuredFormDocument): boolean {
    return doc.sections.some((section) => (section.blocks ?? []).some((b) => b.type === "unresolved_field"));
}

export function isPersistable(doc: StructuredFormDocument): boolean {
    return !hasUnresolvedBlocks(doc);
}
