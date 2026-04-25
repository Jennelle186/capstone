import type {
    SchoolYearCreateFormState,
    SchoolYearPayload,
    SchoolYearRecord,
    SchoolYearRolloverFormState,
    SchoolYearRolloverPayload,
    SchoolYearStatus,
} from "@/types/schoolYear";

/// Utility functions and constants for managing school years in the application.
export const DEFAULT_SCHOOL_YEAR_FORM: SchoolYearCreateFormState = {
    name: "",
    startDate: "",
    endDate: "",
    autoClosureDate: "",
    status: "upcoming",
    setAsActive: false,
};

export const DEFAULT_SCHOOL_YEAR_ROLLOVER_FORM: SchoolYearRolloverFormState = {
    name: "",
    startDate: "",
    endDate: "",
    autoClosureDate: "",
    copyAssignments: true,
    copyRequirements: true,
    setAsActive: false,
};

// Mapping of school year statuses to their display labels.
export const SCHOOL_YEAR_STATUS_LABEL: Record<SchoolYearStatus, string> = {
    upcoming: "Open",
    active: "Active",
    closed: "Closed / Archived",
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
        auto_closure_date: formData.autoClosureDate ? formData.autoClosureDate : null,
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
    if (payload.auto_closure_date && payload.auto_closure_date < payload.start_date) {
        return "Auto closure date cannot be earlier than the start date.";
    }
    if (payload.status === "closed" && payload.set_as_active) {
        return "A closed school year cannot be set as active.";
    }
    return null;
}

function normalizeSchoolYearName(name: string): string {
    return name.trim().toLowerCase();
}

function findSchoolYearByName(name: string, schoolYears: SchoolYearRecord[]): SchoolYearRecord | null {
    const normalizedName = normalizeSchoolYearName(name);
    return schoolYears.find((schoolYear) => normalizeSchoolYearName(schoolYear.name) === normalizedName) ?? null;
}

// Adds years to a date string.
function addYears(dateValue: string, yearsToAdd: number): string {
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return "";
    parsed.setFullYear(parsed.getFullYear() + yearsToAdd);
    return parsed.toISOString().slice(0, 10);
}

// Builds a default rollover form state based on an existing school year record, 
// pre-populating fields for the new school year.
export function buildDefaultRolloverForm(
    schoolYear: SchoolYearRecord,
    schoolYears: SchoolYearRecord[],
): SchoolYearRolloverFormState {
    const yearMatch = schoolYear.name.match(/(\d{4})\D+(\d{4})/);
    let nextName = `${schoolYear.name} Copy`;
    let dateBaseSchoolYear = schoolYear;

    if (yearMatch) {
        let candidateStartYear = Number(yearMatch[1]) + 1;
        let candidateEndYear = Number(yearMatch[2]) + 1;
        let existingCandidate = findSchoolYearByName(`${candidateStartYear}-${candidateEndYear}`, schoolYears);

        while (existingCandidate) {
            dateBaseSchoolYear = existingCandidate;
            candidateStartYear += 1;
            candidateEndYear += 1;
            existingCandidate = findSchoolYearByName(`${candidateStartYear}-${candidateEndYear}`, schoolYears);
        }

        nextName = `${candidateStartYear}-${candidateEndYear}`;
    } else {
        let copyIndex = 1;
        while (findSchoolYearByName(nextName, schoolYears)) {
            copyIndex += 1;
            nextName = `${schoolYear.name} Copy ${copyIndex}`;
        }
    }

    return {
        ...DEFAULT_SCHOOL_YEAR_ROLLOVER_FORM,
        name: nextName,
        startDate: addYears(dateBaseSchoolYear.start_date, 1),
        endDate: addYears(dateBaseSchoolYear.end_date, 1),
        autoClosureDate: dateBaseSchoolYear.auto_closure_date ? addYears(dateBaseSchoolYear.auto_closure_date, 1) : "",
    };
}

// Utility function to build a payload for rolling over a school year based on form data.
export function buildSchoolYearRolloverPayload(formData: SchoolYearRolloverFormState): SchoolYearRolloverPayload {
    return {
        name: formData.name.trim(),
        start_date: formData.startDate,
        end_date: formData.endDate,
        auto_closure_date: formData.autoClosureDate ? formData.autoClosureDate : null,
        copy_assignments: formData.copyAssignments,
        copy_requirements: formData.copyRequirements,
        set_as_active: formData.setAsActive,
    };
}

// Utility function to validate the school year rollover payload before sending it to the API. Returns an error message if validation fails, or null if the payload is valid.
export function validateSchoolYearRolloverPayload(payload: SchoolYearRolloverPayload): string | null {
    if (!payload.name || !payload.start_date || !payload.end_date) {
        return "School year name, start date, and end date are required.";
    }
    if (payload.end_date < payload.start_date) {
        return "End date cannot be earlier than the start date.";
    }
    if (payload.auto_closure_date && payload.auto_closure_date < payload.start_date) {
        return "Auto closure date cannot be earlier than the start date.";
    }
    return null;
}
