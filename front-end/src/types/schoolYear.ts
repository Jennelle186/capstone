export type SchoolYearStatus = "upcoming" | "active" | "closed";

export interface SchoolYearRecord {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    status: SchoolYearStatus;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface SchoolYearCreateFormState {
    name: string;
    startDate: string;
    endDate: string;
    status: SchoolYearStatus;
    setAsActive: boolean;
}

export interface SchoolYearPayload {
    name: string;
    start_date: string;
    end_date: string;
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
