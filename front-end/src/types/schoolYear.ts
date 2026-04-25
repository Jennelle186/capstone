export type SchoolYearStatus = "upcoming" | "active" | "closed";

export interface SchoolYearRecord {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    auto_closure_date: string | null;
    status: SchoolYearStatus;
    is_active: boolean;
    adviser_assignment_count: number;
    requirement_count: number;
    active_department_count: number;
    missing_department_assignments: string[];
    readiness_issues: string[];
    is_ready: boolean;
    created_at: string;
    updated_at: string;
}

export interface SchoolYearCreateFormState {
    name: string;
    startDate: string;
    endDate: string;
    autoClosureDate: string;
    status: SchoolYearStatus;
    setAsActive: boolean;
}

export interface SchoolYearPayload {
    name: string;
    start_date: string;
    end_date: string;
    auto_closure_date: string | null;
    status: SchoolYearStatus;
    set_as_active: boolean;
}

export interface SchoolYearDepartmentAssignment {
    department_id: string;
    department_code: string;
    department_name: string;
    department_is_active: boolean;
    adviser_id: string | null;
    adviser_name: string | null;
    adviser_email: string | null;
}

export interface SchoolYearActivationPreview {
    selected_school_year: SchoolYearRecord;
    current_active_school_year: SchoolYearRecord | null;
    will_replace_current_active: boolean;
    can_activate: boolean;
    readiness_issues: string[];
    adviser_assignment_count: number;
    requirement_count: number;
    missing_department_assignments: string[];
}

export interface SchoolYearAuditLog {
    id: string;
    school_year_id: string;
    action: string;
    actor_user_id: string | null;
    actor_clerk_user_id: string | null;
    actor_name: string | null;
    previous_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    created_at: string;
}

export interface SchoolYearRolloverFormState {
    name: string;
    startDate: string;
    endDate: string;
    autoClosureDate: string;
    copyAssignments: boolean;
    copyRequirements: boolean;
    setAsActive: boolean;
}

export interface SchoolYearRolloverPayload {
    name: string;
    start_date: string;
    end_date: string;
    auto_closure_date: string | null;
    copy_assignments: boolean;
    copy_requirements: boolean;
    set_as_active: boolean;
}
