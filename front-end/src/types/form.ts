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

/** A titled group of fields. Fields flow into a fixed 2-column grid. */
export interface FormLayoutSection {
    id: string;
    heading: string;
    fields: FormFieldSpec[];
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
    document_json: FormDocument;
    pdf_file_key: string | null;
    extraction_schema_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface FormCreatePayload {
    name: string;
    description?: string | null;
    document_json: FormDocument;
}

export interface FormUpdatePayload {
    name?: string;
    description?: string | null;
    document_json?: FormDocument;
}

export interface FormGenerateResponse {
    document_json: FormDocument;
    fields_json: unknown[];
    form_name: string;
    form_control_id: string;
}
