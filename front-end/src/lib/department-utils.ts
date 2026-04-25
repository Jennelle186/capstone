import type { AdviserDepartmentRecord, AdviserDepartmentResponse } from "@/types/adviser";
import type {
    DepartmentCreateFormState,
    DepartmentListResponse,
    DepartmentOption,
} from "@/types/department";

/// Utility functions and constants for managing departments in the application, 
// including form state, error parsing, and data formatting for dropdown options and display.
export const DEFAULT_DEPARTMENT_FORM: DepartmentCreateFormState = {
    code: "",
    name: "",
};

// Utility function to extract error message from API response, 
// with a fallback if the expected structure is not present
export function parseDepartmentApiError(payload: unknown, fallback: string): string {
    if (
        payload &&
        typeof payload === "object" &&
        "detail" in payload &&
        typeof (payload as { detail?: unknown }).detail === "string"
    ) {
        return (payload as { detail: string }).detail;
    }
    return fallback;
}

// Utility function to convert department code and name into an option format suitable for dropdowns, 
// where the value is the department code and the label combines the code and name for better readability in the dropdown.
export function toDepartmentOption(code: string, name: string): { value: string; label: string } {
    return {
        value: code,
        label: `${code} - ${name}`,
    };
}

// Utility function to sort departments with active entries first, then alphabetically by code.
export function sortDepartmentOptions(departments: DepartmentOption[]): DepartmentOption[] {
    return [...departments].sort((left, right) => {
        if (left.isActive !== right.isActive) {
            return left.isActive ? -1 : 1;
        }
        return left.value.localeCompare(right.value);
    });
}

// Utility function to map the API response for the list of departments into a format suitable for dropdown options, 
// including sorting the options alphabetically by department code. 
export function mapDepartmentOptions(payload: DepartmentListResponse): DepartmentOption[] {
    return sortDepartmentOptions(
        payload.map((department) => ({
            id: department.id,
            value: department.code,
            label: department.name,
            isActive: department.is_active,
            studentCount: department.student_count,
        })),
    );
}

// Utility function to map the API response for advisers with department information into a format suitable for display in the department details page, 
// where the is_active field from the API is mapped to isActive for consistency in the application's data structures.
export function mapAdvisersForDepartments(payload: AdviserDepartmentResponse[]): AdviserDepartmentRecord[] {
    return payload.map((adviser) => ({
        id: adviser.id,
        name: adviser.name,
        email: adviser.email,
        department: adviser.department,
        isActive: adviser.is_active,
    }));
}
