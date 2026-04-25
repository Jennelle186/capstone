export interface Option {
    value: string;
    label: string;
}

export interface DepartmentCreateResponse {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
    adviser_count: number;
    student_count: number;
    created_at: string;
    updated_at: string;
}

export type DepartmentListResponse = DepartmentCreateResponse[];
export type DepartmentUpdateResponse = DepartmentCreateResponse;

export interface DepartmentOption {
    id: string;
    value: string;
    label: string;
    isActive: boolean;
    studentCount: number;
}

export interface DepartmentCreateFormState {
    code: string;
    name: string;
}

export interface DepartmentEditFormState {
    code: string;
    name: string;
    isActive: boolean;
}
