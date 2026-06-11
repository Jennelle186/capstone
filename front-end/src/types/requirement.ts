export interface RequirementAssignmentItem {
    document_type_id: string;
    extraction_schema_id: string | null;
}

export interface RequirementAssignmentPayload {
    school_year_id: string;
    document_type_ids: string[];
    requirements?: RequirementAssignmentItem[];
}

export interface RequirementAssignmentResponse {
    school_year_id: string;
    document_type_ids: string[];
    requirements: RequirementAssignmentItem[];
}
