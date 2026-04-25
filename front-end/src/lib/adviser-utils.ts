import type { AdviserFormState } from "@/types/adviser";
import type { Option } from "@/types/department";
import { DEFAULT_SCHOOL_YEAR_FORM } from "@/lib/school-year-utils";

// Constants for special dropdown values that trigger the display of the "Add Department" and "Add School Year" dialogs when selected in the respective dropdowns.
export const ADD_DEPARTMENT_VALUE = "__add_department__";
export const ADD_SCHOOL_YEAR_VALUE = "__add_school_year__";

// Utility functions and constants for managing advisers in the application, including form state, error parsing, and data formatting for dropdown options and display.
export { DEFAULT_SCHOOL_YEAR_FORM };

// Utility function to extract error message from API response, with a fallback if the expected structure is not present
export const EMPTY_ADVISER_FORM: AdviserFormState = {
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    department: "",
    schoolYear: "",
};

// For school years, we only want to include those that are not closed, since closed school years should not be assignable to advisers. The label is just the name since it already includes the year range.
export function toSchoolYearOption(name: string): Option {
    return {
        value: name,
        label: name,
    };
}

// Utility function to format date strings into a more human-readable format, with error handling for invalid date inputs
export function formatDate(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Utility functions to build a full name string from form data and to split a full name back into its components, with handling for edge cases like extra spaces or missing parts
export function buildFullName(formData: AdviserFormState): string {
    return [formData.firstName.trim(), formData.middleName.trim(), formData.lastName.trim()]
        .filter(Boolean)
        .join(" ");
}

// The splitFullName function takes a full name string and attempts to parse it into first name, middle name, and last name components. It handles various edge cases such as extra spaces and different numbers of name parts. If there is only one part, it assumes it's the first name. If there are two parts, it assumes they are the first and last names. If there are more than two parts, it treats the first part as the first name, the last part as the last name, and everything in between as the middle name.
export function splitFullName(name: string): Pick<AdviserFormState, "firstName" | "middleName" | "lastName"> {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: "", middleName: "", lastName: "" };
    if (parts.length === 1) return { firstName: parts[0], middleName: "", lastName: "" };
    if (parts.length === 2) return { firstName: parts[0], middleName: "", lastName: parts[1] };
    return {
        firstName: parts[0],
        middleName: parts.slice(1, -1).join(" "),
        lastName: parts[parts.length - 1],
    };
}

// Utility function to generate initials from a full name, which can be used for avatar placeholders. It takes the first letter of each part of the name, joins them together, and converts to uppercase. It also handles edge cases like extra spaces or empty name parts.
export function getInitials(name: string): string {
    return name
        .split(" ")
        .filter(Boolean)
        .map((part) => part[0] ?? "")
        .join("")
        .toUpperCase();
}
