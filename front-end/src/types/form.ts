import type { ExtractionSchemaField } from "./extractionSchema";

export type FormFieldUiComponent =
    | "text_input"
    | "radio_group"
    | "checkbox_group"
    | "dropdown"
    | "date_picker";

export interface FieldOption {
    value: string;
    label: string;
}

export interface FieldNodeAttrs {
    field_key: string;
    label: string;
    ui_component: FormFieldUiComponent;
    required: boolean;
    options: FieldOption[] | null;
}

/** A field placed in a form layout. Extends the shared attrs with a stable id. */
export interface FormFieldSpec extends FieldNodeAttrs {
    id: string;
}

/** Typography controls applied to a block. */
export interface TextStyle {
    fontSize?: number | null;
    bold?: boolean;
    italic?: boolean;
    align?: "left" | "center" | "right" | "justify" | null;
    spacing?: number | null;
}

/** A field placed as an authoritative `block` in a section. */
export interface FieldBlock extends FieldNodeAttrs {
    type: "field";
    id: string;
    columnSpan?: number;
    pageBreakBefore?: boolean;
    style?: TextStyle | null;
}

export interface ParagraphBlock {
    type: "paragraph";
    id: string;
    text: string;
    style?: TextStyle | null;
    pageBreakBefore?: boolean;
}

export interface TableBlock {
    type: "table";
    id: string;
    columns: number;
    rows: string[][];
    columnWidths?: string[] | null;
    /** Render the first row as a repeating header in print output. */
    headerRow?: boolean;
    pageBreakBefore?: boolean;
}

export interface SignatureBlock {
    type: "signature";
    id: string;
    label: string;
    pageBreakBefore?: boolean;
}

/** A field key invented by the AI with no matching configured field. Never persisted. */
export interface UnresolvedFieldBlock {
    type: "unresolved_field";
    id: string;
    field_key: string;
    label: string;
}

export type FormBlock = FieldBlock | ParagraphBlock | TableBlock | SignatureBlock | UnresolvedFieldBlock;

/** Per-form letterhead text overrides; the logo itself is global (Branding). */
export interface Letterhead {
    institutionName?: string | null;
    addressLines?: string[];
    contactLine?: string | null;
    formNumber?: string | null;
}

export interface PageMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface PageSettings {
    size: "A4" | "Letter";
    orientation: "portrait" | "landscape";
    margins?: PageMargins;
    /** Scale the printed form down so it fits on a single page. */
    fitToPage?: boolean;
}

/** A titled group of fields/blocks. Fields flow into a fixed 2-column grid. */
export interface FormLayoutSection {
    id: string;
    heading: string;
    fields: FormFieldSpec[];
    blocks?: FormBlock[];
}

export type FormPaperMode = "edit" | "preview";

export type FormCreationMode = "structured" | "pdf_overlay";

/** Canonical structured (sections + fields) form document. */
export interface StructuredFormDocument {
    version: 1;
    creation_mode: "structured";
    title: string;
    subtitle?: string;
    instructions?: string;
    letterhead?: Letterhead | null;
    page?: PageSettings | null;
    sections: FormLayoutSection[];
    signatureLabel: string;
    footer?: string;
}

/** A field absolutely positioned over a PDF background page. */
export interface OverlayFieldSpec extends FieldNodeAttrs {
    id: string;
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
}

/** PDF-overlay form document (fields mapped over an uploaded PDF). */
export interface PdfOverlayDocument {
    version: 1;
    creation_mode: "pdf_overlay";
    pdf_file_key: string | null;
    page_count: number;
    fields: OverlayFieldSpec[];
}

export type FormDocument = StructuredFormDocument | PdfOverlayDocument;

export interface FormRecord {
    id: string;
    name: string;
    description: string | null;
    creation_mode: FormCreationMode;
    document_type_id: string | null;
    document_json: FormDocument;
    pdf_file_key: string | null;
    extraction_schema_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface FormCreatePayload {
    name: string;
    description?: string | null;
    document_type_id?: string | null;
    document_json: FormDocument;
}

export interface FormUpdatePayload {
    name?: string;
    description?: string | null;
    document_type_id?: string | null;
    document_json?: FormDocument;
}

export interface FormGenerateResponse {
    document_json: FormDocument;
    fields_json: ExtractionSchemaField[];
    form_name: string;
    form_control_id: string;
    warnings: string[];
}
