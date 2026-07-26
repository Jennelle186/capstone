export type AdviserStudentClassification = "freshman" | "transferee" | "shifter" | "returning" | "cross_enrollee";

export interface ExtractedAnalyticsValue {
    value: string;
    label: string;
}

export interface UnmappedField {
    key: string;
    value: string;
    section_title: string;
}

export interface UnmappedDocGroup {
    document_type: string;
    fields: UnmappedField[];
}

export interface AdviserStudent {
    id: string;
    name: string;
    initials: string;
    student_number: string | null;
    email: string | null;
    image_url: string | null;
    program: string;
    school_year: string;
    classification: AdviserStudentClassification;
    application_status: "SUBMITTED_COMPLETE" | "PENDING_DOCUMENTS" | null;
    documents_submitted: number;
    documents_total: number;
    completion_pct: number;
    gender: string | null;
    cet_score: number | null;
    gpa: number | null;
    high_school: string | null;
    provincial_address: string | null;
    extracted_analytics?: Record<string, ExtractedAnalyticsValue>;
    unmapped_data?: UnmappedDocGroup[];
    created_at: string;
}

export interface AdviserSlotItem {
    document_type_name: string;
    is_primary: boolean;
}

export interface AdviserSlot {
    id: string;
    name: string;
    is_complete: boolean;
    min_required: number;
    matched_count: number;
    items: AdviserSlotItem[];
}

export interface AdviserStudentSubmission {
    id: string;
    student_id: string;
    student_name: string | null;
    student_number: string | null;
    document_type: string;
    status: string;
    submitted_at: string;
    extraction_fields: Record<string, unknown>;
    classification_result?: Record<string, unknown> | null;
}

export interface SchoolYear {
    id: string;
    name: string;
    is_current: boolean;
}

export const CLASSIFICATION_LABELS: Record<AdviserStudentClassification, string> = {
    freshman: "Freshman",
    transferee: "Transferee",
    shifter: "Shifter",
    returning: "Returning / Continuing",
    cross_enrollee: "Cross-Enrolee",
};

export const CLASSIFICATION_BADGE_CLASSES: Record<AdviserStudentClassification, string> = {
    freshman: "bg-blue-100 text-blue-700",
    transferee: "bg-purple-100 text-purple-700",
    shifter: "bg-amber-100 text-amber-700",
    returning: "bg-emerald-100 text-emerald-700",
    cross_enrollee: "bg-rose-100 text-rose-700",
};
