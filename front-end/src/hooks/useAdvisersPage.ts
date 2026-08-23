import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import {
    ADD_DEPARTMENT_VALUE,
    ADD_SCHOOL_YEAR_VALUE,
    splitFullName,
    toSchoolYearOption,
    DEFAULT_SCHOOL_YEAR_FORM,
    EMPTY_ADVISER_FORM,
} from "@/lib/adviser-utils";
import {
    DEFAULT_DEPARTMENT_FORM,
    parseDepartmentApiError,
    toDepartmentOption,
} from "@/lib/department-utils";
import type {
    Adviser,
    AdviserApiResponse,
    AdviserAssignmentHistoryRecord,
    AdviserFormState,
    AdviserInvitationCreatePayload,
    AdviserInvitationCreateResponse,
    AdviserInvitationRecord,
} from "@/types/adviser";
import type {
    DepartmentCreateFormState,
    DepartmentCreateResponse,
    DepartmentListResponse,
    Option,
} from "@/types/department";
import type { SchoolYearCreateFormState, SchoolYearRecord } from "@/types/schoolYear";

export function useAdvisersPage() {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useStableToken();

    const [advisers, setAdvisers] = useState<Adviser[]>([]);
    const [adviserInvitations, setAdviserInvitations] = useState<AdviserInvitationRecord[]>([]);
    const [departments, setDepartments] = useState<Option[]>([]);
    const [schoolYears, setSchoolYears] = useState<Option[]>([]);
    const [activeSchoolYearName, setActiveSchoolYearName] = useState<string | null>(null);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isAddDepartmentDialogOpen, setIsAddDepartmentDialogOpen] = useState(false);
    const [isAddSchoolYearDialogOpen, setIsAddSchoolYearDialogOpen] = useState(false);
    const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);

    const [selectedAdviser, setSelectedAdviser] = useState<Adviser | null>(null);
    const [historyAdviser, setHistoryAdviser] = useState<Adviser | null>(null);
    const [historyByAdviserId, setHistoryByAdviserId] = useState<Record<string, AdviserAssignmentHistoryRecord[]>>({});
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    const [departmentCreateForm, setDepartmentCreateForm] = useState<DepartmentCreateFormState>(DEFAULT_DEPARTMENT_FORM);
    const [schoolYearCreateForm, setSchoolYearCreateForm] = useState<SchoolYearCreateFormState>(DEFAULT_SCHOOL_YEAR_FORM);
    const [departmentFormError, setDepartmentFormError] = useState("");
    const [schoolYearFormError, setSchoolYearFormError] = useState("");
    const [isAddingDepartment, setIsAddingDepartment] = useState(false);
    const [isAddingSchoolYear, setIsAddingSchoolYear] = useState(false);
    const [isAddingAdviser, setIsAddingAdviser] = useState(false);
    const [isEditingAdviser, setIsEditingAdviser] = useState(false);
    const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
    const [revokingInvitationId, setRevokingInvitationId] = useState<string | null>(null);
    const [formData, setFormData] = useState<AdviserFormState>(EMPTY_ADVISER_FORM);

    const requestWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<unknown> => {
            const token = await getTokenRef.current();
            if (!token) throw new Error("Missing admin authentication token.");

            const response = await fetchWithClerkAuth(path, token, init);
            if (!response.ok) {
                let message = `Request failed with status ${response.status}.`;
                try {
                    const payload = (await response.json()) as unknown;
                    message = parseDepartmentApiError(payload, message);
                } catch {
                    // Ignore non-JSON payloads.
                }
                throw new Error(message);
            }
            return response.status === 204 ? null : ((await response.json()) as unknown);
        },
        [],
    );

    const mapAdvisers = useCallback(
        (payload: AdviserApiResponse[], schoolYearName: string | null): Adviser[] =>
            payload.map((adviser) => ({
                id: adviser.id,
                name: adviser.name,
                firstName: adviser.first_name ?? null,
                middleName: adviser.middle_name ?? null,
                lastName: adviser.last_name ?? null,
                email: adviser.email,
                department: adviser.department,
                departments: adviser.departments ?? [],
                schoolYear: adviser.school_year ?? schoolYearName,
                isActive: adviser.is_active,
                createdAt: adviser.created_at,
            })),
        [],
    );

    const loadPageData = useCallback(async () => {
        setIsPageLoading(true);
        try {
            const [departmentsPayload, schoolYearsPayload, advisersPayload, invitationsPayload] = await Promise.all([
                requestWithAdminAuth("/api/admin/departments") as Promise<DepartmentListResponse>,
                requestWithAdminAuth("/api/admin/school-years") as Promise<SchoolYearRecord[]>,
                requestWithAdminAuth("/api/admin/advisers") as Promise<AdviserApiResponse[]>,
                requestWithAdminAuth("/api/admin/advisers/invitations") as Promise<AdviserInvitationRecord[]>,
            ]);

            const activeSchoolYear = schoolYearsPayload.find((schoolYear) => schoolYear.is_active) ?? null;
            setActiveSchoolYearName(activeSchoolYear?.name ?? null);

            setDepartments(
                departmentsPayload
                    .filter((department) => department.is_active)
                    .map((department) => toDepartmentOption(department.code, department.name))
                    .sort((left, right) => left.value.localeCompare(right.value)),
            );

            setSchoolYears(
                schoolYearsPayload
                    .filter((schoolYear) => schoolYear.status !== "closed")
                    .map((schoolYear) => toSchoolYearOption(schoolYear.name))
                    .sort((left, right) => right.value.localeCompare(left.value)),
            );

            setAdvisers(mapAdvisers(advisersPayload, activeSchoolYear?.name ?? null));
            setAdviserInvitations(invitationsPayload);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load advisers page data.");
        } finally {
            setIsPageLoading(false);
        }
    }, [mapAdvisers, requestWithAdminAuth]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setAdvisers([]);
            setAdviserInvitations([]);
            setDepartments([]);
            setSchoolYears([]);
            setActiveSchoolYearName(null);
            setHistoryByAdviserId({});
            setHistoryAdviser(null);
            setIsHistoryDialogOpen(false);
            setIsPageLoading(false);
            return;
        }
        void loadPageData();
    }, [isLoaded, isSignedIn, loadPageData]);

    const isFormValid = useMemo(() => {
        const baseFieldsValid = Boolean(
            formData.firstName.trim() &&
            formData.lastName.trim() &&
            formData.email.trim() &&
            formData.schoolYear.trim(),
        );
        // Add mode requires a single department selection; edit mode requires at least one department code.
        const departmentValid = isEditDialogOpen
            ? formData.departmentCodes.length > 0
            : formData.department.trim().length > 0;
        return baseFieldsValid && departmentValid;
    }, [formData, isEditDialogOpen]);

    const filteredAdvisers = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return advisers;

        return advisers.filter((adviser) => {
            const department = adviser.department ?? "";
            const schoolYear = adviser.schoolYear ?? "";
            return (
                adviser.name.toLowerCase().includes(normalizedQuery) ||
                (adviser.email ?? "").toLowerCase().includes(normalizedQuery) ||
                department.toLowerCase().includes(normalizedQuery) ||
                schoolYear.toLowerCase().includes(normalizedQuery)
            );
        });
    }, [advisers, searchQuery]);

    const resetForm = useCallback(() => {
        setFormData(EMPTY_ADVISER_FORM);
    }, []);

    const handleAddAdviser = useCallback(async () => {
        if (!isFormValid) return;

        // Adviser creation now uses an invitation flow: admin submits details, backend sends Clerk invite.
        const payload: AdviserInvitationCreatePayload = {
            email: formData.email.trim().toLowerCase(),
            first_name: formData.firstName.trim(),
            middle_name: formData.middleName.trim() || null,
            last_name: formData.lastName.trim(),
            department_code: formData.department.trim(),
            school_year_name: formData.schoolYear.trim(),
        };

        setIsAddingAdviser(true);
        try {
            const response = (await requestWithAdminAuth("/api/admin/advisers/invitations", {
                method: "POST",
                body: JSON.stringify(payload),
            })) as AdviserInvitationCreateResponse;

            setIsAddDialogOpen(false);
            resetForm();
            if (response.invitation_url) {
                toast.success("Invitation sent. Adviser can finish registration from email link.");
            } else {
                toast.success("Invitation created.");
            }
            // Refresh to keep sidebar counters and dependent views in sync with server state.
            await loadPageData();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to invite adviser.");
        } finally {
            setIsAddingAdviser(false);
        }
    }, [formData, isFormValid, loadPageData, requestWithAdminAuth, resetForm]);

    const handleEditAdviser = useCallback(async () => {
        if (!selectedAdviser || !isFormValid) return;

        setIsEditingAdviser(true);
        try {
            await requestWithAdminAuth(`/api/admin/advisers/${selectedAdviser.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    first_name: formData.firstName.trim(),
                    middle_name: formData.middleName.trim() || null,
                    last_name: formData.lastName.trim(),
                    email: formData.email.trim(),
                    department_codes: formData.departmentCodes,
                    school_year_name: formData.schoolYear.trim(),
                }),
            });

            setIsEditDialogOpen(false);
            setSelectedAdviser(null);
            resetForm();
            toast.success("Adviser updated.");
            await loadPageData();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update adviser.");
        } finally {
            setIsEditingAdviser(false);
        }
    }, [formData, isFormValid, loadPageData, requestWithAdminAuth, resetForm, selectedAdviser]);

    const handleDeleteAdviser = useCallback(() => {
        if (!selectedAdviser) return;

        setAdvisers((prev) => prev.filter((adviser) => adviser.id !== selectedAdviser.id));
        setIsDeleteDialogOpen(false);
        setSelectedAdviser(null);
    }, [selectedAdviser]);

    const toggleAdviserStatus = useCallback(
        async (adviser: Adviser) => {
            setStatusUpdatingId(adviser.id);
            try {
                const payload = (await requestWithAdminAuth(`/api/admin/advisers/${adviser.id}/status`, {
                    method: "POST",
                    body: JSON.stringify({ is_active: !adviser.isActive }),
                })) as AdviserApiResponse;

                setAdvisers((prev) =>
                    prev.map((item) =>
                        item.id === adviser.id
                            ? {
                                ...item,
                                name: payload.name,
                                firstName: payload.first_name ?? item.firstName ?? null,
                                middleName: payload.middle_name ?? item.middleName ?? null,
                                lastName: payload.last_name ?? item.lastName ?? null,
                                email: payload.email,
                                department: payload.department,
                                departments: payload.departments ?? [],
                                schoolYear: payload.school_year ?? item.schoolYear,
                                isActive: payload.is_active,
                            }
                            : item,
                    ),
                );

                toast.success(payload.is_active ? "Adviser activated." : "Adviser deactivated and locked.");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to update adviser status.");
            } finally {
                setStatusUpdatingId(null);
            }
        },
        [requestWithAdminAuth],
    );

    const revokeAdviserInvitation = useCallback(
        async (invitation: AdviserInvitationRecord) => {
            if (invitation.status !== "pending") return;

            setRevokingInvitationId(invitation.id);
            try {
                const updated = (await requestWithAdminAuth(`/api/admin/advisers/invitations/${invitation.id}/revoke`, {
                    method: "POST",
                })) as AdviserInvitationRecord;

                setAdviserInvitations((prev) =>
                    prev.map((item) => (item.id === updated.id ? updated : item)),
                );
                toast.success("Invitation revoked.");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to revoke invitation.");
            } finally {
                setRevokingInvitationId(null);
            }
        },
        [requestWithAdminAuth],
    );

    const loadAssignmentHistory = useCallback(
        async (adviserId: string, forceRefresh = false) => {
            if (!forceRefresh && historyByAdviserId[adviserId]) return;

            setIsHistoryLoading(true);
            try {
                const payload = (await requestWithAdminAuth(`/api/admin/advisers/${adviserId}/assignments`)) as AdviserAssignmentHistoryRecord[];
                setHistoryByAdviserId((prev) => ({ ...prev, [adviserId]: payload }));
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load adviser assignment history.");
            } finally {
                setIsHistoryLoading(false);
            }
        },
        [historyByAdviserId, requestWithAdminAuth],
    );

    const openEditDialog = useCallback(
        (adviser: Adviser) => {
            setSelectedAdviser(adviser);
            const fallbackSplitName = splitFullName(adviser.name);
            setFormData({
                firstName: adviser.firstName ?? fallbackSplitName.firstName,
                middleName: adviser.middleName ?? fallbackSplitName.middleName,
                lastName: adviser.lastName ?? fallbackSplitName.lastName,
                email: adviser.email ?? "",
                department: adviser.department || "",
                departmentCodes: adviser.departments ?? (adviser.department ? [adviser.department] : []),
                schoolYear: adviser.schoolYear || activeSchoolYearName || "",
            });
            setIsEditDialogOpen(true);
        },
        [activeSchoolYearName],
    );

    const openAddDialog = useCallback(() => {
        setFormData({
            ...EMPTY_ADVISER_FORM,
            schoolYear: activeSchoolYearName ?? "",
        });
        setIsAddDialogOpen(true);
    }, [activeSchoolYearName]);

    const openDeleteDialog = useCallback((adviser: Adviser) => {
        setSelectedAdviser(adviser);
        setIsDeleteDialogOpen(true);
    }, []);

    const openHistoryDialog = useCallback(
        (adviser: Adviser) => {
            setHistoryAdviser(adviser);
            setIsHistoryDialogOpen(true);
            void loadAssignmentHistory(adviser.id);
        },
        [loadAssignmentHistory],
    );

    const handleHistoryDialogOpenChange = useCallback((open: boolean) => {
        setIsHistoryDialogOpen(open);
        if (!open) {
            setHistoryAdviser(null);
        }
    }, []);

    const historyRecords = useMemo(
        () => (historyAdviser ? historyByAdviserId[historyAdviser.id] ?? [] : []),
        [historyAdviser, historyByAdviserId],
    );

    const handleDepartmentSelect = useCallback((value: string) => {
        if (value === ADD_DEPARTMENT_VALUE) {
            setDepartmentCreateForm(DEFAULT_DEPARTMENT_FORM);
            setDepartmentFormError("");
            setIsAddDepartmentDialogOpen(true);
            return;
        }
        setFormData((prev) => ({ ...prev, department: value }));
    }, []);

    const handleDepartmentCodesChange = useCallback((codes: string[]) => {
        setFormData((prev) => ({ ...prev, departmentCodes: codes }));
    }, []);

    const handleSchoolYearSelect = useCallback((value: string) => {
        if (value === ADD_SCHOOL_YEAR_VALUE) {
            setSchoolYearCreateForm(DEFAULT_SCHOOL_YEAR_FORM);
            setSchoolYearFormError("");
            setIsAddSchoolYearDialogOpen(true);
            return;
        }
        setFormData((prev) => ({ ...prev, schoolYear: value }));
    }, []);

    const handleCreateDepartmentOption = useCallback(async () => {
        const code = departmentCreateForm.code.trim().toUpperCase();
        const name = departmentCreateForm.name.trim();

        if (!code || !name) {
            setDepartmentFormError("Department code and name are required.");
            return;
        }

        if (departments.some((department) => department.value.toLowerCase() === code.toLowerCase())) {
            setDepartmentFormError("Department code already exists.");
            return;
        }

        setIsAddingDepartment(true);
        try {
            const payload = (await requestWithAdminAuth("/api/admin/departments", {
                method: "POST",
                body: JSON.stringify({ code, name }),
            })) as DepartmentCreateResponse;

            const nextOption = toDepartmentOption(payload.code, payload.name);
            setDepartments((prev) =>
                [...prev, nextOption]
                    .filter(
                        (option, index, source) =>
                            source.findIndex((item) => item.value.toLowerCase() === option.value.toLowerCase()) === index,
                    )
                    .sort((left, right) => left.value.localeCompare(right.value)),
            );
            setFormData((prev) => ({ ...prev, department: payload.code }));
            setDepartmentCreateForm(DEFAULT_DEPARTMENT_FORM);
            setDepartmentFormError("");
            setIsAddDepartmentDialogOpen(false);
            toast.success("Department added.");
            void loadPageData();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to add department.";
            setDepartmentFormError(message);
            toast.error(message);
        } finally {
            setIsAddingDepartment(false);
        }
    }, [departmentCreateForm, departments, loadPageData, requestWithAdminAuth]);

    const handleCreateSchoolYearOption = useCallback(async () => {
        const payload = {
            name: schoolYearCreateForm.name.trim(),
            start_date: schoolYearCreateForm.startDate,
            end_date: schoolYearCreateForm.endDate,
            status: schoolYearCreateForm.status,
            set_as_active: schoolYearCreateForm.setAsActive,
        };

        if (!payload.name || !payload.start_date || !payload.end_date) {
            setSchoolYearFormError("School year name, start date, and end date are required.");
            return;
        }
        if (payload.end_date < payload.start_date) {
            setSchoolYearFormError("End date cannot be earlier than the start date.");
            return;
        }
        if (payload.status === "closed" && payload.set_as_active) {
            setSchoolYearFormError("A closed school year cannot be set as active.");
            return;
        }

        setIsAddingSchoolYear(true);
        try {
            const createdSchoolYear = (await requestWithAdminAuth("/api/admin/school-years", {
                method: "POST",
                body: JSON.stringify(payload),
            })) as SchoolYearRecord;

            const nextOption = toSchoolYearOption(createdSchoolYear.name);
            if (createdSchoolYear.status !== "closed") {
                setSchoolYears((prev) =>
                    [...prev, nextOption]
                        .filter(
                            (option, index, source) =>
                                source.findIndex((item) => item.value.toLowerCase() === option.value.toLowerCase()) === index,
                        )
                        .sort((left, right) => right.value.localeCompare(left.value)),
                );
            }
            setFormData((prev) => ({ ...prev, schoolYear: createdSchoolYear.name }));
            setSchoolYearCreateForm(DEFAULT_SCHOOL_YEAR_FORM);
            setSchoolYearFormError("");
            setIsAddSchoolYearDialogOpen(false);
            toast.success("School year added.");
            void loadPageData();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to add school year.";
            setSchoolYearFormError(message);
            toast.error(message);
        } finally {
            setIsAddingSchoolYear(false);
        }
    }, [loadPageData, requestWithAdminAuth, schoolYearCreateForm]);

    return {
        activeSchoolYearName,
        adviserInvitations,
        addDepartmentValue: ADD_DEPARTMENT_VALUE,
        addSchoolYearValue: ADD_SCHOOL_YEAR_VALUE,
        departmentCreateForm,
        departmentFormError,
        departments,
        filteredAdvisers,
        formData,
        handleAddAdviser,
        handleCreateDepartmentOption,
        handleCreateSchoolYearOption,
        handleDeleteAdviser,
        handleDepartmentSelect,
        handleDepartmentCodesChange,
        handleEditAdviser,
        handleHistoryDialogOpenChange,
        handleSchoolYearSelect,
        historyAdviser,
        historyRecords,
        isAddDepartmentDialogOpen,
        isAddDialogOpen,
        isAddSchoolYearDialogOpen,
        isAddingDepartment,
        isAddingAdviser,
        isAddingSchoolYear,
        isDeleteDialogOpen,
        isEditDialogOpen,
        isEditingAdviser,
        isFormValid,
        isHistoryDialogOpen,
        isHistoryLoading,
        isPageLoading,
        revokingInvitationId,
        openAddDialog,
        openDeleteDialog,
        openEditDialog,
        openHistoryDialog,
        schoolYearCreateForm,
        schoolYearFormError,
        schoolYears,
        searchQuery,
        selectedAdviser,
        setDepartmentCreateForm,
        setFormData,
        setIsAddDepartmentDialogOpen,
        setIsAddDialogOpen,
        setIsAddSchoolYearDialogOpen,
        setIsDeleteDialogOpen,
        setIsEditDialogOpen,
        setSchoolYearCreateForm,
        setSearchQuery,
        statusUpdatingId,
        toggleAdviserStatus,
        revokeAdviserInvitation,
    };
}
