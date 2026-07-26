export type ExtractionSchemaStatus = "draft" | "active" | "archived";

export type ExtractionSchemaFieldType = "string" | "number" | "integer" | "boolean" | "select" | "multi-select";

export interface FieldOption {
    value: string;
    label: string;
}

export interface BucketConfig {
    min?: number | null;
    max?: number | null;
    label: string;
}

export interface ComputationConfig {
    operation: "average" | "sum" | "max" | "min";
    dependencies: string[];
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
    is_analytics?: boolean;
    analytics_mode?: "distribution" | "numeric_summary" | "boolean_summary" | "bucketized" | null;
    analytics_group?: string | null;
    analytics_label?: string | null;
    canonical_key?: string | null;
    buckets?: BucketConfig[] | null;
    is_computed?: boolean;
    computation?: ComputationConfig | null;
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

export interface SandboxClassificationResult {
    document_type_id: string | null;
    document_type_name: string;
    document_type_code: string;
    confidence: number;
    reasoning: string;
}

export interface SandboxSchemaInfo {
    id: string;
    name: string;
}

export interface SandboxFieldResult {
    key: string;
    label: string;
    type: string;
    value: string;
    confidence: number;
}

export interface SandboxExtractionResponse {
    classification: SandboxClassificationResult;
    schema_info: SandboxSchemaInfo | null;
    fields: SandboxFieldResult[];
}
