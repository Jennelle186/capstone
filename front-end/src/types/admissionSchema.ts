export type AdmissionSchemaStatus = "draft" | "active" | "archived";

export type AdmissionSchemaFieldType = "string" | "number" | "integer" | "boolean";

export interface AdmissionSchemaField {
    id: string;
    key: string;
    type: AdmissionSchemaFieldType;
    description: string;
    required: boolean;
}

export interface AdmissionSchemaRecord {
    id: string;
    name: string;
    version_label: string | null;
    effective_date: string | null;
    description: string | null;
    schema_json: Record<string, unknown>;
    fields_json: AdmissionSchemaField[];
    status: AdmissionSchemaStatus;
    source_file_name: string | null;
    generation_prompt: string | null;
    created_at: string;
    updated_at: string;
}

export interface AdmissionSchemaPayload {
    name: string;
    version_label: string | null;
    effective_date: string | null;
    description: string | null;
    schema_json: Record<string, unknown>;
    fields_json: AdmissionSchemaField[];
    status: AdmissionSchemaStatus;
    source_file_name: string | null;
    generation_prompt: string | null;
}

export interface AdmissionSchemaGenerateResponse {
    schema_json: Record<string, unknown>;
    fields_json: AdmissionSchemaField[];
    file_id: string;
    source_file_name: string | null;
}
