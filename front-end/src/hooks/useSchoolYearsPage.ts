import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { fetchWithClerkAuth } from "@/lib/api";
import {
    buildSchoolYearPayload,
    DEFAULT_SCHOOL_YEAR_FORM,
    parseSchoolYearApiError,
    validateSchoolYearPayload,
} from "@/lib/school-year-utils";
import type {
    SchoolYearCreateFormState,
    SchoolYearDepartmentAssignment,
    SchoolYearPayload,
    SchoolYearRecord,
    SchoolYearStatus,
} from "@/types/schoolYear";

// Constants and utility functions related to managing school years in the admin interface, including form state, API interactions, and error handling.
type StatusFilter = "all" | SchoolYearStatus;

// Represents the intent to activate a school year, 
// either through a quick activation from the list or as part of saving a school year with the active status. 
// This is used to trigger confirmation dialogs when activating a school year would cause another to become inactive.
type ActivationIntent =
    | { kind: "quick"; schoolYear: SchoolYearRecord }
    | { kind: "save"; payload: SchoolYearPayload }
    | null;

    // The useSchoolYearsPage hook encapsulates all the state and logic for the School Years admin page,
// including loading school years, handling form interactions for creating/editing school years,
export function useSchoolYearsPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [formData, setFormData] = useState<SchoolYearCreateFormState>(DEFAULT_SCHOOL_YEAR_FORM);
    const [editingSchoolYear, setEditingSchoolYear] = useState<SchoolYearRecord | null>(null);
    const [viewingSchoolYear, setViewingSchoolYear] = useState<SchoolYearRecord | null>(null);
    const [schoolYearAssignments, setSchoolYearAssignments] = useState<SchoolYearDepartmentAssignment[]>([]);
    const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false);
    const [activationIntent, setActivationIntent] = useState<ActivationIntent>(null);
    const [schoolYearToDeactivate, setSchoolYearToDeactivate] = useState<SchoolYearRecord | null>(null);
    const [schoolYearToClose, setSchoolYearToClose] = useState<SchoolYearRecord | null>(null);

    // Compute the currently active school year from the list of school years, 
    const activeSchoolYear = useMemo(
        () => schoolYears.find((schoolYear) => schoolYear.is_active) ?? null,
        [schoolYears],
    );

    // Compute the list of school years filtered by the search query and status filter,
    const filteredSchoolYears = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        return schoolYears.filter((schoolYear) => {
            const matchesQuery =
                normalizedQuery.length === 0 ||
                schoolYear.name.toLowerCase().includes(normalizedQuery) ||
                schoolYear.start_date.includes(normalizedQuery) ||
                schoolYear.end_date.includes(normalizedQuery);
            const matchesStatus = statusFilter === "all" || schoolYear.status === statusFilter;
            return matchesQuery && matchesStatus;
        });
    }, [schoolYears, searchQuery, statusFilter]);

    // Utility function to make authenticated API requests to the admin endpoints,
    const requestWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<unknown> => {
            const token = await getToken();
            if (!token) throw new Error("Missing admin authentication token.");

            const response = await fetchWithClerkAuth(path, token, init);
            if (!response.ok) {
                let message = `Request failed with status ${response.status}.`;
                try {
                    const payload = (await response.json()) as unknown;
                    message = parseSchoolYearApiError(payload, message);
                } catch {
                    // Ignore malformed payloads.
                }
                throw new Error(message);
            }
            return response.status === 204 ? null : ((await response.json()) as unknown);
        },
        [getToken],
    );

    // Function to load the list of school years from the API, with error handling and loading state management.
    const loadSchoolYears = useCallback(async () => {
        setIsLoading(true);
        try {
            const payload = (await requestWithAdminAuth("/api/admin/school-years")) as SchoolYearRecord[];
            setSchoolYears(payload);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load school years.");
        } finally {
            setIsLoading(false);
        }
    }, [requestWithAdminAuth]);

    // Load school years when the component mounts and when authentication state changes, 
    // ensuring that we only attempt to load data once we know whether the user is signed in or not.
    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setIsLoading(false);
            return;
        }
        void loadSchoolYears();
    }, [isLoaded, isSignedIn, loadSchoolYears]);

    // Function to close the form dialog and reset related state, used after saving or cancelling out of the form.
    const closeFormDialog = useCallback(() => {
        setIsFormOpen(false);
        setEditingSchoolYear(null);
        setFormData(DEFAULT_SCHOOL_YEAR_FORM);
    }, []);


    // Handler for opening the form dialog, which also resets the form state if we're closing the dialog. 
    // This is used as the onOpenChange handler for the SchoolYearFormDialog component.
    const handleFormOpenChange = useCallback(
        (open: boolean) => {
            if (!open) {
                closeFormDialog();
                return;
            }
            setIsFormOpen(true);
        },
        [closeFormDialog],
    );

    // Handler for opening the create school year dialog, 
    // which resets the form to the default state and clears any editing context.
    const openCreateDialog = useCallback(() => {
        setEditingSchoolYear(null);
        setFormData(DEFAULT_SCHOOL_YEAR_FORM);
        setIsFormOpen(true);
    }, []);

    // Handler for opening the edit school year dialog, 
    // which populates the form with the selected school year's data and 
    // sets the editing context.
    const openEditDialog = useCallback((schoolYear: SchoolYearRecord) => {
        setEditingSchoolYear(schoolYear);
        setFormData({
            name: schoolYear.name,
            startDate: schoolYear.start_date,
            endDate: schoolYear.end_date,
            status: schoolYear.status,
            setAsActive: schoolYear.is_active,
        });
        setIsFormOpen(true);
    }, []);

    // Function to determine whether we need to show a confirmation prompt when saving a school year with the active status,
    const shouldConfirmActivationSwitch = useCallback(
        (payload: SchoolYearPayload): boolean => {
            const activationRequested = payload.set_as_active || payload.status === "active";
            if (!activationRequested || activeSchoolYear === null) return false;
            if (editingSchoolYear && editingSchoolYear.id === activeSchoolYear.id) return false;
            return true;
        },
        [activeSchoolYear, editingSchoolYear],
    );

    // Handler for submitting the school year form, which handles both creating and updating school years based on whether we're in editing mode.
    const submitSchoolYear = useCallback(
        async (skipActivationPrompt = false, payloadOverride?: SchoolYearPayload) => {
            const payload = payloadOverride ?? buildSchoolYearPayload(formData);
            const validationMessage = validateSchoolYearPayload(payload);
            if (validationMessage) {
                toast.error(validationMessage);
                return;
            }
            if (!skipActivationPrompt && shouldConfirmActivationSwitch(payload)) {
                setActivationIntent({ kind: "save", payload });
                return;
            }

            setIsSaving(true);
            try {
                if (editingSchoolYear) {
                    await requestWithAdminAuth(`/api/admin/school-years/${editingSchoolYear.id}`, {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                    });
                    toast.success("School year updated.");
                } else {
                    await requestWithAdminAuth("/api/admin/school-years", {
                        method: "POST",
                        body: JSON.stringify(payload),
                    });
                    toast.success("School year created.");
                }

                closeFormDialog();
                await loadSchoolYears();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to save school year.");
            } finally {
                setIsSaving(false);
            }
        },
        [closeFormDialog, editingSchoolYear, formData, loadSchoolYears, requestWithAdminAuth, shouldConfirmActivationSwitch],
    );

    // Handler for quickly activating a school year from the list, 
    // which checks if we need to show a confirmation prompt before proceeding with the activation.
    const setSchoolYearActive = useCallback(
        async (schoolYear: SchoolYearRecord) => {
            try {
                await requestWithAdminAuth(`/api/admin/school-years/${schoolYear.id}/set-active`, { method: "POST" });
                toast.success(`${schoolYear.name} is now the active school year.`);
                await loadSchoolYears();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to activate school year.");
            }
        },
        [loadSchoolYears, requestWithAdminAuth],
    );

    // Handler for closing a school year, which sends a request to the API to mark the school year as closed and then reloads the list of school years.s
    const closeSchoolYear = useCallback(
        async (schoolYear: SchoolYearRecord) => {
            try {
                await requestWithAdminAuth(`/api/admin/school-years/${schoolYear.id}/close`, { method: "POST" });
                toast.success(`${schoolYear.name} was marked as closed.`);
                await loadSchoolYears();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to close school year.");
            } finally {
                setSchoolYearToClose(null);
            }
        },
        [loadSchoolYears, requestWithAdminAuth],
    );

    // Handler for setting a school year as inactive, 
    // which sends a request to the API to mark the school year as inactive and then 
    // reloads the list of school years.
    const setSchoolYearInactive = useCallback(
        async (schoolYear: SchoolYearRecord) => {
            try {
                await requestWithAdminAuth(`/api/admin/school-years/${schoolYear.id}/set-inactive`, { method: "POST" });
                toast.success(`${schoolYear.name} is now inactive.`);
                await loadSchoolYears();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to set school year as inactive.");
            } finally {
                setSchoolYearToDeactivate(null);
            }
        },
        [loadSchoolYears, requestWithAdminAuth],
    );

    // Handler for quickly activating a school year from the list, 
    // which checks if we need to show a confirmation prompt before proceeding with the activation.
    const handleQuickActivate = useCallback(
        (schoolYear: SchoolYearRecord) => {
            if (schoolYear.is_active) return;
            if (activeSchoolYear && activeSchoolYear.id !== schoolYear.id) {
                setActivationIntent({ kind: "quick", schoolYear });
                return;
            }
            void setSchoolYearActive(schoolYear);
        },
        [activeSchoolYear, setSchoolYearActive],
    );

    // Handler for confirming the activation of a school year after the user has been prompted,
    const handleConfirmActivation = useCallback(() => {
        if (!activationIntent) return;

        if (activationIntent.kind === "quick") {
            const nextSchoolYear = activationIntent.schoolYear;
            setActivationIntent(null);
            void setSchoolYearActive(nextSchoolYear);
            return;
        }

        // If we're here, it means we're confirming activation as part of saving a school year from the form. We can proceed with the save since the user has already confirmed they want to switch active school years.
        const payload = activationIntent.payload;
        setActivationIntent(null);
        void submitSchoolYear(true, payload);
    }, [activationIntent, setSchoolYearActive, submitSchoolYear]);

    // Handler for opening the view school year dialog, which sets the viewing context and opens the dialog.
    const openViewDialog = useCallback((schoolYear: SchoolYearRecord) => {
        setViewingSchoolYear(schoolYear);
        setIsViewOpen(true);
        setIsAssignmentsLoading(true);
        void requestWithAdminAuth(`/api/admin/school-years/${schoolYear.id}/assignments`)
            .then((payload) => {
                setSchoolYearAssignments(payload as SchoolYearDepartmentAssignment[]);
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Failed to load school year assignments.");
                setSchoolYearAssignments([]);
            })
            .finally(() => {
                setIsAssignmentsLoading(false);
            });
    }, [requestWithAdminAuth]);

    const handleViewOpenChange = useCallback((open: boolean) => {
        setIsViewOpen(open);
        if (!open) {
            setViewingSchoolYear(null);
            setSchoolYearAssignments([]);
            setIsAssignmentsLoading(false);
        }
    }, []);

    // Handler for closing the view school year dialog, which clears the viewing context and closes the dialog.
    return {
        activationIntent,
        activeSchoolYear,
        closeFormDialog,
        closeSchoolYear,
        editingSchoolYear,
        filteredSchoolYears,
        formData,
        handleConfirmActivation,
        handleFormOpenChange,
        handleQuickActivate,
        handleViewOpenChange,
        isAssignmentsLoading,
        isFormOpen,
        isLoading,
        isSaving,
        isViewOpen,
        loadSchoolYears,
        openCreateDialog,
        openEditDialog,
        openViewDialog,
        schoolYearToClose,
        schoolYearToDeactivate,
        schoolYearAssignments,
        schoolYears,
        searchQuery,
        setActivationIntent,
        setFormData,
        setSchoolYearToClose,
        setSchoolYearToDeactivate,
        setSearchQuery,
        setStatusFilter,
        setSchoolYearInactive,
        statusFilter,
        submitSchoolYear,
        viewingSchoolYear,
    };
}
