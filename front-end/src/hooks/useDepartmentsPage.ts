import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import {
    DEFAULT_DEPARTMENT_FORM,
    mapAdvisersForDepartments,
    mapDepartmentOptions,
    parseDepartmentApiError,
    sortDepartmentOptions,
} from "@/lib/department-utils";
import type { AdviserDepartmentRecord, AdviserDepartmentResponse } from "@/types/adviser";
import type {
    DepartmentCreateFormState,
    DepartmentCreateResponse,
    DepartmentListResponse,
    DepartmentOption,
    DepartmentUpdateResponse,
} from "@/types/department";
import type { SchoolYearRecord } from "@/types/schoolYear";

function withSchoolYearQuery(path: string, schoolYearId: string | null): string {
    if (!schoolYearId) return path;
    const joiner = path.includes("?") ? "&" : "?";
    return `${path}${joiner}school_year_id=${encodeURIComponent(schoolYearId)}`;
}

export function useDepartmentsPage() {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useStableToken();

    const [advisers, setAdvisers] = useState<AdviserDepartmentRecord[]>([]);
    const [departments, setDepartments] = useState<DepartmentOption[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [isPageLoading, setIsPageLoading] = useState(true);

    const [isAddDepartmentDialogOpen, setIsAddDepartmentDialogOpen] = useState(false);
    const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
    const [isEditDepartmentDialogOpen, setIsEditDepartmentDialogOpen] = useState(false);

    const [selectedAdviser, setSelectedAdviser] = useState<AdviserDepartmentRecord | null>(null);
    const [selectedDepartment, setSelectedDepartment] = useState("");
    const [editingDepartment, setEditingDepartment] = useState<DepartmentOption | null>(null);

    const [addDepartmentForm, setAddDepartmentForm] = useState<DepartmentCreateFormState>(DEFAULT_DEPARTMENT_FORM);
    const [editDepartmentForm, setEditDepartmentForm] = useState<DepartmentCreateFormState>(DEFAULT_DEPARTMENT_FORM);
    const [editDepartmentIsActive, setEditDepartmentIsActive] = useState(true);

    const [departmentFormError, setDepartmentFormError] = useState("");
    const [editDepartmentFormError, setEditDepartmentFormError] = useState("");

    const [isAddingDepartment, setIsAddingDepartment] = useState(false);
    const [isEditingDepartment, setIsEditingDepartment] = useState(false);
    const [isUpdatingAssignment, setIsUpdatingAssignment] = useState(false);

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
                    // Ignore malformed payloads.
                }
                throw new Error(message);
            }
            return response.status === 204 ? null : ((await response.json()) as unknown);
        },
        [],
    );

    const loadData = useCallback(
        async (schoolYearIdOverride?: string | null) => {
            setIsPageLoading(true);
            try {
                const schoolYearsPayload = (await requestWithAdminAuth("/api/admin/school-years")) as SchoolYearRecord[];
                setSchoolYears(schoolYearsPayload);

                const fallbackSchoolYearId =
                    schoolYearsPayload.find((schoolYear) => schoolYear.is_active)?.id ??
                    schoolYearsPayload[0]?.id ??
                    null;
                const resolvedSchoolYearId = schoolYearIdOverride ?? fallbackSchoolYearId;
                setSelectedSchoolYearId(resolvedSchoolYearId);

                const departmentsPayload = (await requestWithAdminAuth(
                    withSchoolYearQuery("/api/admin/departments", resolvedSchoolYearId),
                )) as DepartmentListResponse;
                setDepartments(mapDepartmentOptions(departmentsPayload));

                try {
                    const advisersPayload = (await requestWithAdminAuth(
                        withSchoolYearQuery("/api/admin/departments/advisers", resolvedSchoolYearId),
                    )) as AdviserDepartmentResponse[];
                    setAdvisers(mapAdvisersForDepartments(advisersPayload));
                } catch (error) {
                    setAdvisers([]);
                    toast.error(error instanceof Error ? error.message : "Failed to load advisers.");
                }
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load departments page.");
            } finally {
                setIsPageLoading(false);
            }
        },
        [requestWithAdminAuth],
    );

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setAdvisers([]);
            setDepartments([]);
            setSchoolYears([]);
            setSelectedSchoolYearId(null);
            setIsPageLoading(false);
            return;
        }
        void loadData();
    }, [isLoaded, isSignedIn, loadData]);

    const selectedSchoolYear = useMemo(
        () => schoolYears.find((schoolYear) => schoolYear.id === selectedSchoolYearId) ?? null,
        [schoolYears, selectedSchoolYearId],
    );
    const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

    const getAdvisersByDepartment = useCallback(
        (departmentCode: string | null) => advisers.filter((adviser) => adviser.department === departmentCode),
        [advisers],
    );

    const getDepartmentAdviserCount = useCallback(
        (departmentCode: string) => getAdvisersByDepartment(departmentCode).length,
        [getAdvisersByDepartment],
    );

    const unassignedAdvisers = useMemo(() => advisers.filter((adviser) => adviser.department === null), [advisers]);

    const assignedAdvisersCount = useMemo(
        () => advisers.filter((adviser) => adviser.department !== null).length,
        [advisers],
    );

    const matchesSearch = useCallback(
        (department: DepartmentOption, adviser?: AdviserDepartmentRecord) => {
            if (!normalizedSearchQuery) return true;

            const searchCorpus = [
                department.value,
                department.label,
                selectedSchoolYear?.name ?? "",
                `s.y. ${selectedSchoolYear?.name ?? ""}`,
                adviser?.name ?? "",
                adviser?.email ?? "",
            ]
                .join(" ")
                .toLowerCase();

            return searchCorpus.includes(normalizedSearchQuery);
        },
        [normalizedSearchQuery, selectedSchoolYear?.name],
    );

    const filteredUnassignedAdvisers = useMemo(
        () =>
            unassignedAdvisers.filter((adviser) => {
                if (!normalizedSearchQuery) return true;
                const searchCorpus = [
                    adviser.name,
                    adviser.email ?? "",
                    selectedSchoolYear?.name ?? "",
                    `s.y. ${selectedSchoolYear?.name ?? ""}`,
                ]
                    .join(" ")
                    .toLowerCase();
                return searchCorpus.includes(normalizedSearchQuery);
            }),
        [normalizedSearchQuery, selectedSchoolYear?.name, unassignedAdvisers],
    );

    const filteredDepartments = useMemo(
        () =>
            departments.filter((department) => {
                if (matchesSearch(department)) return true;
                return advisers.some(
                    (adviser) =>
                        adviser.department === department.value &&
                        matchesSearch(department, adviser),
                );
            }),
        [advisers, departments, matchesSearch],
    );

    const getVisibleAdvisersByDepartment = useCallback(
        (department: DepartmentOption) =>
            advisers.filter(
                (adviser) =>
                    adviser.department === department.value &&
                    matchesSearch(department, adviser),
            ),
        [advisers, matchesSearch],
    );

    const openAddDepartmentDialog = useCallback(() => {
        setDepartmentFormError("");
        setAddDepartmentForm(DEFAULT_DEPARTMENT_FORM);
        setIsAddDepartmentDialogOpen(true);
    }, []);

    const openAssignDialog = useCallback((adviser: AdviserDepartmentRecord) => {
        setSelectedAdviser(adviser);
        setSelectedDepartment(adviser.department ?? "");
        setIsAssignDialogOpen(true);
    }, []);

    const openEditDepartmentDialog = useCallback((department: DepartmentOption) => {
        setEditingDepartment(department);
        setEditDepartmentForm({ code: department.value, name: department.label });
        setEditDepartmentIsActive(department.isActive);
        setEditDepartmentFormError("");
        setIsEditDepartmentDialogOpen(true);
    }, []);

    const onSchoolYearChange = useCallback(
        (nextSchoolYearId: string) => {
            setSelectedSchoolYearId(nextSchoolYearId);
            void loadData(nextSchoolYearId);
        },
        [loadData],
    );

    const handleAssignDepartment = useCallback(async () => {
        if (!selectedAdviser || !selectedDepartment || !selectedSchoolYearId) return;

        setIsUpdatingAssignment(true);
        try {
            const payload = (await requestWithAdminAuth(
                `/api/admin/departments/advisers/${selectedAdviser.id}/department`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        department_code: selectedDepartment,
                        school_year_id: selectedSchoolYearId,
                    }),
                },
            )) as AdviserDepartmentResponse;

            setAdvisers((prev) =>
                prev.map((adviser) =>
                    adviser.id === payload.id
                        ? {
                            ...adviser,
                            department: payload.department,
                            isActive: payload.is_active,
                        }
                        : adviser,
                ),
            );

            setIsAssignDialogOpen(false);
            setSelectedAdviser(null);
            setSelectedDepartment("");
            toast.success("Adviser assignment updated.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to update adviser assignment.");
        } finally {
            setIsUpdatingAssignment(false);
        }
    }, [requestWithAdminAuth, selectedAdviser, selectedDepartment, selectedSchoolYearId]);

    const handleUnassign = useCallback(
        async (adviser: AdviserDepartmentRecord) => {
            if (!selectedSchoolYearId) {
                toast.error("Select a school year before changing assignments.");
                return;
            }

            setIsUpdatingAssignment(true);
            try {
                const payload = (await requestWithAdminAuth(
                    `/api/admin/departments/advisers/${adviser.id}/department`,
                    {
                        method: "PATCH",
                        body: JSON.stringify({
                            department_code: null,
                            school_year_id: selectedSchoolYearId,
                        }),
                    },
                )) as AdviserDepartmentResponse;

                setAdvisers((prev) =>
                    prev.map((item) =>
                        item.id === payload.id
                            ? {
                                ...item,
                                department: payload.department,
                                isActive: payload.is_active,
                            }
                            : item,
                    ),
                );
                toast.success("Adviser unassigned from department.");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to unassign adviser.");
            } finally {
                setIsUpdatingAssignment(false);
            }
        },
        [requestWithAdminAuth, selectedSchoolYearId],
    );

    const handleAddDepartment = useCallback(async () => {
        const code = addDepartmentForm.code.trim().toUpperCase();
        const name = addDepartmentForm.name.trim();

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

            setDepartments((prev) =>
                sortDepartmentOptions([
                    ...prev,
                    {
                        id: payload.id,
                        value: payload.code,
                        label: payload.name,
                        isActive: payload.is_active,
                        studentCount: payload.student_count,
                    },
                ]),
            );
            setAddDepartmentForm(DEFAULT_DEPARTMENT_FORM);
            setDepartmentFormError("");
            setIsAddDepartmentDialogOpen(false);
            toast.success("Department added.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to add department.";
            setDepartmentFormError(message);
            toast.error(message);
        } finally {
            setIsAddingDepartment(false);
        }
    }, [addDepartmentForm, departments, requestWithAdminAuth]);

    const handleEditDepartment = useCallback(async () => {
        if (!editingDepartment) return;

        const code = editDepartmentForm.code.trim().toUpperCase();
        const name = editDepartmentForm.name.trim();

        if (!code || !name) {
            setEditDepartmentFormError("Department code and name are required.");
            return;
        }

        if (
            departments.some(
                (department) =>
                    department.id !== editingDepartment.id &&
                    department.value.toLowerCase() === code.toLowerCase(),
            )
        ) {
            setEditDepartmentFormError("Department code already exists.");
            return;
        }

        setIsEditingDepartment(true);
        try {
            const payload = (await requestWithAdminAuth(`/api/admin/departments/${editingDepartment.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                    code,
                    name,
                    is_active: editDepartmentIsActive,
                }),
            })) as DepartmentUpdateResponse;

            setDepartments((prev) =>
                sortDepartmentOptions(
                    prev.map((department) =>
                        department.id === payload.id
                            ? {
                                ...department,
                                value: payload.code,
                                label: payload.name,
                                isActive: payload.is_active,
                                studentCount: payload.student_count,
                            }
                            : department,
                    ),
                ),
            );

            if (editingDepartment.value !== payload.code) {
                setAdvisers((prev) =>
                    prev.map((adviser) =>
                        adviser.department === editingDepartment.value
                            ? { ...adviser, department: payload.code }
                            : adviser,
                    ),
                );
            }

            setEditDepartmentFormError("");
            setIsEditDepartmentDialogOpen(false);
            setEditingDepartment(null);
            toast.success("Department updated.");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to update department.";
            setEditDepartmentFormError(message);
            toast.error(message);
        } finally {
            setIsEditingDepartment(false);
        }
    }, [departments, editDepartmentForm, editDepartmentIsActive, editingDepartment, requestWithAdminAuth]);

    return {
        addDepartmentForm,
        advisers,
        assignedAdvisersCount,
        departmentFormError,
        departments,
        editDepartmentForm,
        editDepartmentFormError,
        editDepartmentIsActive,
        getAdvisersByDepartment,
        getDepartmentAdviserCount,
        getVisibleAdvisersByDepartment,
        handleAddDepartment,
        handleAssignDepartment,
        handleEditDepartment,
        handleUnassign,
        filteredDepartments,
        filteredUnassignedAdvisers,
        isAddDepartmentDialogOpen,
        isAddingDepartment,
        isAssignDialogOpen,
        isEditDepartmentDialogOpen,
        isEditingDepartment,
        isPageLoading,
        isSelectedSchoolYearClosed: selectedSchoolYear?.status === "closed",
        isUpdatingAssignment,
        onSchoolYearChange,
        openAddDepartmentDialog,
        openAssignDialog,
        openEditDepartmentDialog,
        schoolYears,
        searchQuery,
        selectedAdviser,
        selectedDepartment,
        selectedSchoolYearId,
        selectedSchoolYearName: selectedSchoolYear?.name ?? null,
        setSearchQuery,
        setAddDepartmentForm,
        setEditDepartmentForm,
        setEditDepartmentIsActive,
        setIsAddDepartmentDialogOpen,
        setIsAssignDialogOpen,
        setIsEditDepartmentDialogOpen,
        setSelectedDepartment,
        unassignedAdvisers,
    };
}
