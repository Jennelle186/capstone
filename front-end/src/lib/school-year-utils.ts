import type { SchoolYearCreateFormState, SchoolYearPayload, SchoolYearStatus } from "@/types/schoolYear";

/// Utility functions and constants for managing school years in the application.
export const DEFAULT_SCHOOL_YEAR_FORM: SchoolYearCreateFormState = {
    name: "",
    startDate: "",
    endDate: "",
    status: "upcoming",
    setAsActive: false,
};

// Mapping of school year statuses to their display labels.
export const SCHOOL_YEAR_STATUS_LABEL: Record<SchoolYearStatus, string> = {
    upcoming: "Upcoming",
    active: "Active",
    closed: "Closed",
};

// Mapping of school year statuses to their corresponding badge styles for UI display.
export const SCHOOL_YEAR_STATUS_BADGE_STYLE: Record<SchoolYearStatus, string> = {
    upcoming: "bg-blue-100 text-blue-700 hover:bg-blue-100",
    active: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    closed: "bg-slate-200 text-slate-700 hover:bg-slate-200",
};

// Utility function to format a date string for display in the UI.
export function formatSchoolYearDate(dateValue: string): string {
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;
    return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Utility function to format a date-time string for display in the UI.
export function formatSchoolYearDateTime(dateTimeValue: string): string {
    const parsed = new Date(dateTimeValue);
    if (Number.isNaN(parsed.getTime())) return dateTimeValue;
    return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Utility function to extract a user-friendly error message from an API error response related to school year operations.
export function parseSchoolYearApiError(payload: unknown, fallback: string): string {
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

// Utility function to build a payload for creating or updating a school year based on form data.
export function buildSchoolYearPayload(formData: SchoolYearCreateFormState): SchoolYearPayload {
    return {
        name: formData.name.trim(),
        start_date: formData.startDate,
        end_date: formData.endDate,
        status: formData.status,
        set_as_active: formData.setAsActive,
    };
}

// Utility function to validate the school year payload before sending it to the API. Returns an error message if validation fails, or null if the payload is valid.
export function validateSchoolYearPayload(payload: SchoolYearPayload): string | null {
    if (!payload.name || !payload.start_date || !payload.end_date) {
        return "School year name, start date, and end date are required.";
    }
    if (payload.end_date < payload.start_date) {
        return "End date cannot be earlier than the start date.";
    }
    if (payload.status === "closed" && payload.set_as_active) {
        return "A closed school year cannot be set as active.";
    }
    return null;
}
