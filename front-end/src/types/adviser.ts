// Type definitions related to advisers, including response shapes for API calls and form state interfaces
export interface AdviserProfileResponse {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  email: string | null;
  department: string | null;
  departments: string[];
  school_year: string | null;
}

// Department assigned to an adviser for the active (or selected) school year.
// Returned by GET /api/adviser/departments.
export interface AdviserDepartment {
  id: string;
  name: string;
  code: string;
}

export interface Adviser {
    id: string;
    name: string;
    firstName?: string | null;
    middleName?: string | null;
    lastName?: string | null;
    email: string | null;
    department: string | null;
    departments: string[];
    schoolYear: string | null;
    isActive: boolean;
    createdAt: string;
}

// This interface represents the shape of the API response when fetching adviser data, which includes all relevant fields returned by the API for an adviser.
export interface AdviserApiResponse {
    id: string;
    name: string;
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    email: string | null;
    department: string | null;
    departments: string[];
    school_year: string | null;
    is_active: boolean;
    created_at: string;
}

// This interface defines the shape of the form state used when creating or editing an adviser, which includes fields for the adviser's name components, email, department, and school year.
export interface AdviserAssignmentHistoryRecord {
    school_year_id: string;
    school_year_name: string;
    department: string | null;
    assigned_at: string;
}

// This interface defines the shape of the form state used when creating or editing an adviser, which includes fields for the adviser's name components, email, department, and school year.
export interface AdviserInvitationCreatePayload {
    email: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    department_code: string;
    school_year_name: string;
}

export interface AdviserInvitationCreateResponse {
    id: string;
    clerk_invitation_id: string;
    email: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    department_code: string | null;
    school_year_name: string | null;
    status: "pending" | "accepted" | "revoked" | "expired";
    invitation_url: string | null;
    created_at: string;
}

export interface AdviserInvitationRecord {
    id: string;
    clerk_invitation_id: string;
    email: string;
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    department_code: string | null;
    school_year_name: string | null;
    status: "pending" | "accepted" | "revoked" | "expired";
    invited_by_user_id: string | null;
    accepted_user_id: string | null;
    accepted_adviser_id: string | null;
    expires_at: string | null;
    accepted_at: string | null;
    created_at: string;
    updated_at: string;
}

// This interface defines the shape of the form state used when creating or editing an adviser, which includes fields for the adviser's name components, email, department, and school year.
export interface AdviserDepartmentRecord {
    id: string;
    name: string;
    email: string | null;
    department: string | null;
    departments: string[];
    isActive: boolean;
}

// This interface represents the shape of the API response when fetching adviser data, which includes all relevant fields returned by the API for an adviser.s
export interface AdviserDepartmentResponse {
    id: string;
    name: string;
    email: string | null;
    department: string | null;
    departments: string[];
    is_active: boolean;
    created_at: string;
}

// This interface defines the shape of the form state used when creating or editing an adviser, which includes fields for the adviser's name components, email, department, and school year.
export interface AdviserFormState {
    firstName: string;
    middleName: string;
    lastName: string;
    email: string;
    department: string;
    departmentCodes: string[];
    schoolYear: string;
}
