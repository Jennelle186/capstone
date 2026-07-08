import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import {
    buildDefaultRolloverForm,
    buildSchoolYearRolloverPayload,
    buildSchoolYearPayload,
    DEFAULT_SCHOOL_YEAR_FORM,
    DEFAULT_SCHOOL_YEAR_ROLLOVER_FORM,
    parseSchoolYearApiError,
    validateSchoolYearRolloverPayload,
    validateSchoolYearPayload,
} from "@/lib/school-year-utils";
import type {
    SchoolYearActivationPreview,
    SchoolYearAuditLog,
    SchoolYearCreateFormState,
    SchoolYearDepartmentAssignment,
    SchoolYearPayload,
    SchoolYearRecord,
    SchoolYearRolloverFormState,
    SchoolYearRolloverPayload,
    SchoolYearStatus,
} from "@/types/schoolYear";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
import type { RequirementAssignmentResponse } from "@/types/requirement";

// Constants and utility functions related to managing school years in the admin interface, including form state, API interactions, and error handling.
type StatusFilter = "all" | SchoolYearStatus;

// Represents the intent to activate a school year, 
// either through a quick activation from the list or as part of saving a school year with the active status. 
// This is used to trigger confirmation dialogs when activating a school year would cause another to become inactive.
type ActivationIntent =
    | { kind: "quick"; schoolYear: SchoolYearRecord }
    | { kind: "save"; payload: SchoolYearPayload }
    | null;

function normalizeSchoolYearName(name: string): string {
    return name.trim().toLowerCase();
}

function findDuplicateSchoolYear(
    schoolYears: SchoolYearRecord[],
    name: string,
    excludeId?: string,
): SchoolYearRecord | null {
    const normalizedName = normalizeSchoolYearName(name);
    return schoolYears.find((schoolYear) => {
        if (excludeId && schoolYear.id === excludeId) return false;
        return normalizeSchoolYearName(schoolYear.name) === normalizedName;
    }) ?? null;
}

    // The useSchoolYearsPage hook encapsulates all the state and logic for the School Years admin page,
// including loading school years, handling form interactions for creating/editing school years,
export function useSchoolYearsPage() {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useStableToken();
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
    const [schoolYearAuditLogs, setSchoolYearAuditLogs] = useState<SchoolYearAuditLog[]>([]);
    const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(false);
    const [isAuditLogsLoading, setIsAuditLogsLoading] = useState(false);
    const [schoolYearRequirements, setSchoolYearRequirements] = useState<RequirementAssignmentResponse | null>(null);
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeApiRecord[]>([]);
    const [extractionSchemas, setExtractionSchemas] = useState<ExtractionSchemaRecord[]>([]);
    const [isRequirementsLoading, setIsRequirementsLoading] = useState(false);
    const [activationIntent, setActivationIntent] = useState<ActivationIntent>(null);
    const [activationPreview, setActivationPreview] = useState<SchoolYearActivationPreview | null>(null);
    const [isActivationPreviewLoading, setIsActivationPreviewLoading] = useState(false);
    const [schoolYearToDeactivate, setSchoolYearToDeactivate] = useState<SchoolYearRecord | null>(null);
    const [schoolYearToClose, setSchoolYearToClose] = useState<SchoolYearRecord | null>(null);
    const [schoolYearToReopen, setSchoolYearToReopen] = useState<SchoolYearRecord | null>(null);
    const [rolloverSourceSchoolYear, setRolloverSourceSchoolYear] = useState<SchoolYearRecord | null>(null);
    const [rolloverFormData, setRolloverFormData] = useState<SchoolYearRolloverFormState>(DEFAULT_SCHOOL_YEAR_ROLLOVER_FORM);
    const [isRolloverOpen, setIsRolloverOpen] = useState(false);

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
            const token = await getTokenRef.current();
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
        [],
    );

    const requestRawWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<Response> => {
            const token = await getTokenRef.current();
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
            return response;
        },
        [],
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

    const closeRolloverDialog = useCallback(() => {
        setIsRolloverOpen(false);
        setRolloverSourceSchoolYear(null);
        setRolloverFormData(DEFAULT_SCHOOL_YEAR_ROLLOVER_FORM);
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
            autoClosureDate: schoolYear.auto_closure_date || "",
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

    const loadActivationPreview = useCallback(
        async (schoolYear: SchoolYearRecord) => {
            setIsActivationPreviewLoading(true);
            try {
                const payload = (await requestWithAdminAuth(
                    `/api/admin/school-years/${schoolYear.id}/activation-preview`,
                )) as SchoolYearActivationPreview;
                setActivationPreview(payload);
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load activation preview.");
                setActivationPreview(null);
            } finally {
                setIsActivationPreviewLoading(false);
            }
        },
        [requestWithAdminAuth],
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
            const duplicateSchoolYear = findDuplicateSchoolYear(schoolYears, payload.name, editingSchoolYear?.id);
            if (duplicateSchoolYear) {
                toast.error(`School year "${duplicateSchoolYear.name}" already exists.`);
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
        [
            closeFormDialog,
            editingSchoolYear,
            formData,
            loadSchoolYears,
            requestWithAdminAuth,
            schoolYears,
            shouldConfirmActivationSwitch,
        ],
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
                void loadActivationPreview(schoolYear);
                return;
            }
            void setSchoolYearActive(schoolYear);
        },
        [activeSchoolYear, loadActivationPreview, setSchoolYearActive],
    );

    // Handler for confirming the activation of a school year after the user has been prompted,
    const handleConfirmActivation = useCallback(() => {
        if (!activationIntent) return;

        if (activationIntent.kind === "quick") {
            const nextSchoolYear = activationIntent.schoolYear;
            setActivationIntent(null);
            setActivationPreview(null);
            void setSchoolYearActive(nextSchoolYear);
            return;
        }

        // If we're here, it means we're confirming activation as part of saving a school year from the form. We can proceed with the save since the user has already confirmed they want to switch active school years.
        const payload = activationIntent.payload;
        setActivationIntent(null);
        setActivationPreview(null);
        void submitSchoolYear(true, payload);
    }, [activationIntent, setSchoolYearActive, submitSchoolYear]);

    // Handler for opening the view school year dialog, which sets the viewing context and opens the dialog.
    const openViewDialog = useCallback((schoolYear: SchoolYearRecord) => {
        setViewingSchoolYear(schoolYear);
        setIsViewOpen(true);
        setIsAssignmentsLoading(true);
        setIsAuditLogsLoading(true);
        setIsRequirementsLoading(true);
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
        void requestWithAdminAuth(`/api/admin/school-years/${schoolYear.id}/audit-logs`)
            .then((payload) => {
                setSchoolYearAuditLogs(payload as SchoolYearAuditLog[]);
            })
            .catch(() => {
                setSchoolYearAuditLogs([]);
            })
            .finally(() => {
                setIsAuditLogsLoading(false);
            });
        void Promise.all([
            requestWithAdminAuth(`/api/admin/requirements?school_year_id=${schoolYear.id}`),
            requestWithAdminAuth("/api/admin/document-types?status=all"),
            requestWithAdminAuth("/api/admin/extraction-schemas?status=all"),
        ])
            .then(([requirementsPayload, documentTypesPayload, extractionSchemasPayload]) => {
                setSchoolYearRequirements(requirementsPayload as RequirementAssignmentResponse);
                setDocumentTypes(documentTypesPayload as DocumentTypeApiRecord[]);
                setExtractionSchemas(extractionSchemasPayload as ExtractionSchemaRecord[]);
            })
            .catch((error) => {
                toast.error(error instanceof Error ? error.message : "Failed to load requirements.");
                setSchoolYearRequirements(null);
                setDocumentTypes([]);
                setExtractionSchemas([]);
            })
            .finally(() => {
                setIsRequirementsLoading(false);
            });
    }, [requestWithAdminAuth]);

    const handleViewOpenChange = useCallback((open: boolean) => {
        setIsViewOpen(open);
        if (!open) {
            setViewingSchoolYear(null);
            setSchoolYearAssignments([]);
            setSchoolYearAuditLogs([]);
            setIsAssignmentsLoading(false);
            setIsAuditLogsLoading(false);
            setSchoolYearRequirements(null);
            setDocumentTypes([]);
            setExtractionSchemas([]);
            setIsRequirementsLoading(false);
        }
    }, []);

    const reopenSchoolYear = useCallback(
        async (schoolYear: SchoolYearRecord) => {
            try {
                await requestWithAdminAuth(`/api/admin/school-years/${schoolYear.id}/reopen`, { method: "POST" });
                toast.success(`${schoolYear.name} was reopened.`);
                await loadSchoolYears();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to reopen school year.");
            } finally {
                setSchoolYearToReopen(null);
            }
        },
        [loadSchoolYears, requestWithAdminAuth],
    );

    const runAutoClosure = useCallback(async () => {
        try {
            const payload = (await requestWithAdminAuth("/api/admin/school-years/run-auto-closure", {
                method: "POST",
            })) as { closed_count: number };
            toast.success(
                payload.closed_count === 1
                    ? "1 school year was auto-closed."
                    : `${payload.closed_count} school years were auto-closed.`,
            );
            await loadSchoolYears();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to run auto closure.");
        }
    }, [loadSchoolYears, requestWithAdminAuth]);

    const exportSchoolYearsCsv = useCallback(async () => {
        try {
            const response = await requestRawWithAdminAuth("/api/admin/school-years/export.csv");
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "school-years.csv";
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to export school years.");
        }
    }, [requestRawWithAdminAuth]);

    const openRolloverDialog = useCallback((schoolYear: SchoolYearRecord) => {
        setRolloverSourceSchoolYear(schoolYear);
        setRolloverFormData(buildDefaultRolloverForm(schoolYear, schoolYears));
        setIsRolloverOpen(true);
    }, [schoolYears]);

    const handleRolloverOpenChange = useCallback(
        (open: boolean) => {
            if (!open) {
                closeRolloverDialog();
                return;
            }
            setIsRolloverOpen(true);
        },
        [closeRolloverDialog],
    );

    const submitRollover = useCallback(
        async (payloadOverride?: SchoolYearRolloverPayload) => {
            if (!rolloverSourceSchoolYear) return;
            const payload = payloadOverride ?? buildSchoolYearRolloverPayload(rolloverFormData);
            const validationMessage = validateSchoolYearRolloverPayload(payload);
            if (validationMessage) {
                toast.error(validationMessage);
                return;
            }
            const duplicateSchoolYear = findDuplicateSchoolYear(schoolYears, payload.name);
            if (duplicateSchoolYear) {
                toast.error(`School year "${duplicateSchoolYear.name}" already exists.`);
                return;
            }

            setIsSaving(true);
            try {
                await requestWithAdminAuth(`/api/admin/school-years/${rolloverSourceSchoolYear.id}/rollover`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                toast.success(`${payload.name} was created from ${rolloverSourceSchoolYear.name}.`);
                closeRolloverDialog();
                await loadSchoolYears();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create rollover school year.");
            } finally {
                setIsSaving(false);
            }
        },
        [
            closeRolloverDialog,
            loadSchoolYears,
            requestWithAdminAuth,
            rolloverFormData,
            rolloverSourceSchoolYear,
            schoolYears,
        ],
    );

    // Handler for closing the view school year dialog, which clears the viewing context and closes the dialog.
    return {
        activationIntent,
        activationPreview,
        activeSchoolYear,
        closeFormDialog,
        closeSchoolYear,
        exportSchoolYearsCsv,
        editingSchoolYear,
        filteredSchoolYears,
        formData,
        handleConfirmActivation,
        handleFormOpenChange,
        handleQuickActivate,
        handleRolloverOpenChange,
        handleViewOpenChange,
        isAssignmentsLoading,
        isAuditLogsLoading,
        isActivationPreviewLoading,
        isFormOpen,
        isLoading,
        isRolloverOpen,
        isSaving,
        isViewOpen,
        loadSchoolYears,
        openCreateDialog,
        openEditDialog,
        openRolloverDialog,
        openViewDialog,
        reopenSchoolYear,
        rolloverFormData,
        rolloverSourceSchoolYear,
        runAutoClosure,
        schoolYearToClose,
        schoolYearToDeactivate,
        schoolYearToReopen,
        schoolYearAuditLogs,
        schoolYearAssignments,
        schoolYearRequirements,
        documentTypes,
        extractionSchemas,
        isRequirementsLoading,
        schoolYears,
        searchQuery,
        setActivationIntent,
        setFormData,
        setRolloverFormData,
        setSchoolYearToClose,
        setSchoolYearToDeactivate,
        setSchoolYearToReopen,
        setSearchQuery,
        setStatusFilter,
        setSchoolYearInactive,
        statusFilter,
        submitRollover,
        submitSchoolYear,
        viewingSchoolYear,
    };
}
