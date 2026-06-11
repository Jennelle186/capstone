export interface SchemaRegistrySchemaBrief {
    id: string;
    name: string;
    version_label: string | null;
    status: string;
}

export interface SchemaRegistryRequirementInfo {
    school_year_id: string;
    school_year_name: string;
    extraction_schema_id: string | null;
    extraction_schema_name: string | null;
}

export interface SchemaRegistryEntry {
    document_type_id: string;
    document_type_name: string;
    document_type_code: string;
    status: string;
    extraction_type: "structured" | "none";
    schemas: SchemaRegistrySchemaBrief[];
    requirements: SchemaRegistryRequirementInfo[];
}

export interface SchemaRegistryResponse {
    entries: SchemaRegistryEntry[];
}
