export type ExtractionSchemaStatus = "draft" | "active" | "archived";

export type ExtractionSchemaFieldType = "string" | "number" | "integer" | "boolean" | "select" | "multi-select";

export interface FieldOption {
    value: string;
    label: string;
}

export interface ExtractionSchemaField {
    id: string;
    key: string;
    type: ExtractionSchemaFieldType;
    description: string;
    required: boolean;
    readOnly?: boolean;
    ui_component?: string | null;
    hierarchy_level?: number;
    parent_field_id?: string | null;
    options?: FieldOption[] | null;
    section_id?: string | null;
    section_title?: string | null;
}

export interface ExtractionSchemaRecord {
    id: string;
    name: string;
    version_label: string | null;
    effective_date: string | null;
    description: string | null;
    schema_json: Record<string, unknown>;
    fields_json: ExtractionSchemaField[];
    document_type_id: string | null;
    status: ExtractionSchemaStatus;
    source_file_name: string | null;
    generation_prompt: string | null;
    created_at: string;
    updated_at: string;
}

export interface ExtractionSchemaPayload {
    name: string;
    version_label: string | null;
    effective_date: string | null;
    description: string | null;
    schema_json: Record<string, unknown>;
    fields_json: ExtractionSchemaField[];
    document_type_id: string | null;
    status: ExtractionSchemaStatus;
    source_file_name: string | null;
    generation_prompt: string | null;
}

export interface ExtractionSchemaGenerateResponse {
    schema_json: Record<string, unknown>;
    fields_json: ExtractionSchemaField[];
    file_id: string;
    source_file_name: string | null;
    document_type_id?: string | null;
    effective_date?: string | null;
}
