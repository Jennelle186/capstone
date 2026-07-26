import { useAuth } from "@clerk/clerk-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { SchoolYearRecord } from "@/types/schoolYear";
import type {
    AdminStudent,
    AdminStudentResponse,
    DepartmentSummary,
    DepartmentSummaryResponse,
    StudentsPageResponse,
} from "@/types/student";

function withSchoolYearQuery(path: string, schoolYearId: string | null): string {
    if (!schoolYearId) return path;
    const joiner = path.includes("?") ? "&" : "?";
    return `${path}${joiner}school_year_id=${encodeURIComponent(schoolYearId)}`;
}

function toAdminStudent(raw: AdminStudentResponse): AdminStudent {
    return {
        id: raw.id,
        name: raw.name,
        studentNumber: raw.student_number,
        email: raw.email,
        imageUrl: raw.image_url,
        departmentCode: raw.department_code,
        departmentName: raw.department_name,
        classification: raw.classification,
        documentStatus: raw.document_status,
        documentsSubmitted: raw.documents_submitted,
        documentsTotal: raw.documents_total,
    };
}

function toDepartmentSummary(raw: DepartmentSummaryResponse): DepartmentSummary {
    const enrolled = raw.enrolled_count;
    return {
        code: raw.code,
        name: raw.name,
        enrolledCount: enrolled,
        completedCount: raw.completed_count,
        completionPct: enrolled > 0 ? Math.round((raw.completed_count / enrolled) * 100) : 0,
    };
}

export function useStudentsPage() {
    const { isLoaded, isSignedIn } = useAuth();
    const getTokenRef = useStableToken();

    const [students, setStudents] = useState<AdminStudent[]>([]);
    const [departmentSummaries, setDepartmentSummaries] = useState<DepartmentSummary[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [documentStatusFilter, setDocumentStatusFilter] = useState<string>("all");
    const [departmentFilter, setDepartmentFilter] = useState<string>("all");
    const [isPageLoading, setIsPageLoading] = useState(true);

    const requestWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<unknown> => {
            const token = await getTokenRef.current();
            if (!token) throw new Error("Missing admin authentication token.");

            const response = await fetchWithClerkAuth(path, token, init);
            if (!response.ok) {
                let message = `Request failed with status ${response.status}.`;
                try {
                    const payload = (await response.json()) as Record<string, unknown>;
                    message = (payload.detail as string) ?? message;
                } catch {
                    // Ignore non-JSON payloads.
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
                const schoolYearsPayload = (await requestWithAdminAuth(
                    "/api/admin/school-years",
                )) as SchoolYearRecord[];
                setSchoolYears(schoolYearsPayload);

                const fallbackSchoolYearId =
                    schoolYearsPayload.find((schoolYear) => schoolYear.is_active)?.id ??
                    schoolYearsPayload[0]?.id ??
                    null;
                const resolvedSchoolYearId = schoolYearIdOverride ?? fallbackSchoolYearId;
                setSelectedSchoolYearId(resolvedSchoolYearId);

                const studentsPayload = (await requestWithAdminAuth(
                    withSchoolYearQuery("/api/admin/students", resolvedSchoolYearId),
                )) as StudentsPageResponse;

                setStudents((studentsPayload.students ?? []).map(toAdminStudent));
                setDepartmentSummaries(
                    (studentsPayload.department_summaries ?? []).map(toDepartmentSummary),
                );
            } catch (error) {
                setStudents([]);
                setDepartmentSummaries([]);
                toast.error(error instanceof Error ? error.message : "Failed to load students page.");
            } finally {
                setIsPageLoading(false);
            }
        },
        [requestWithAdminAuth],
    );

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setStudents([]);
            setDepartmentSummaries([]);
            setSchoolYears([]);
            setSelectedSchoolYearId(null);
            setIsPageLoading(false);
            return;
        }
        void loadData();
    }, [isLoaded, isSignedIn, loadData]);

    const onSchoolYearChange = useCallback(
        (nextSchoolYearId: string) => {
            setSelectedSchoolYearId(nextSchoolYearId);
            void loadData(nextSchoolYearId);
        },
        [loadData],
    );

    const normalizedSearchQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery]);

    const filteredStudents = useMemo(
        () =>
            students.filter((student) => {
                if (normalizedSearchQuery) {
                    const corpus =
                        `${student.name} ${student.studentNumber} ${student.email} ${student.departmentCode} ${student.departmentName}`.toLowerCase();
                    if (!corpus.includes(normalizedSearchQuery)) return false;
                }
                if (documentStatusFilter !== "all" && student.documentStatus !== documentStatusFilter) {
                    return false;
                }
                if (departmentFilter !== "all" && student.departmentCode !== departmentFilter) {
                    return false;
                }
                return true;
            }),
        [students, normalizedSearchQuery, documentStatusFilter, departmentFilter],
    );

    const selectedSchoolYear = useMemo(
        () => schoolYears.find((schoolYear) => schoolYear.id === selectedSchoolYearId) ?? null,
        [schoolYears, selectedSchoolYearId],
    );

    const totalEnrolled = useMemo(
        () => departmentSummaries.reduce((sum, d) => sum + d.enrolledCount, 0),
        [departmentSummaries],
    );
    const totalCompleted = useMemo(
        () => departmentSummaries.reduce((sum, d) => sum + d.completedCount, 0),
        [departmentSummaries],
    );

    return {
        departmentFilter,
        departmentSummaries,
        documentStatusFilter,
        filteredStudents,
        isPageLoading,
        onSchoolYearChange,
        searchQuery,
        selectedSchoolYear,
        selectedSchoolYearId,
        schoolYears,
        setDepartmentFilter,
        setDocumentStatusFilter,
        setSearchQuery,
        totalCompleted,
        totalEnrolled,
    };
}
