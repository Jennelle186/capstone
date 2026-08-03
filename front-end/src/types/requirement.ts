export interface RequirementSlotItem {
    id: string;
    document_type_id: string;
    document_type_name: string;
    document_type_code: string;
    extraction_schema_id: string | null;
    extraction_schema_name: string | null;
    is_primary: boolean;
    display_order: number;
}

export interface RequirementSlot {
    id: string;
    school_year_id: string;
    slot_type: "solo" | "group";
    group_name: string | null;
    description: string | null;
    min_required: number;
    display_order: number;
    items: RequirementSlotItem[];
}

export interface SlotItemStatus {
    document_type_id: string;
    document_type_name: string;
    document_type_code: string;
    is_primary: boolean;
}

export interface SlotStatusResponse {
    id: string;
    slot_type: "solo" | "group";
    group_name: string | null;
    description: string | null;
    min_required: number;
    display_order: number;
    items: SlotItemStatus[];
    is_complete: boolean;
    matched_submission_ids: string[];
    duplicate_submission_ids: string[];
    matched_count: number;
}

export interface RequiredSlotsResponse {
    school_year_id: string | null;
    school_year_name: string | null;
    classification: string | null;
    slots: SlotStatusResponse[];
}

export interface SlotItemAssignment {
    id?: string | null;
    document_type_id: string;
    extraction_schema_id?: string | null;
    is_primary?: boolean;
    display_order?: number;
}

export interface SlotAssignment {
    id?: string | null;
    slot_type: "solo" | "group";
    group_name?: string | null;
    description?: string | null;
    min_required?: number;
    display_order: number;
    items: SlotItemAssignment[];
}

export interface SlotAssignmentPayload {
    school_year_id: string;
    slots: SlotAssignment[];
}

export interface SlotAssignmentResponse {
    school_year_id: string;
    slots: RequirementSlot[];
}

export interface RequirementAssignmentItem {
    id: string;
    document_type_id: string;
    extraction_schema_id: string | null;
}

export interface RequirementAssignmentResponse {
    school_year_id: string;
    requirements: RequirementAssignmentItem[];
}

export function getSlotDisplayName(slot: SlotStatusResponse): string {
    if (slot.group_name) return slot.group_name;
    if (slot.description) return slot.description;
    if (slot.items[0]?.document_type_name) return slot.items[0].document_type_name;
    return "Untitled requirement";
}
