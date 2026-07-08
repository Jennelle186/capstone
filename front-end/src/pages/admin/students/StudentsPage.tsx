"use client";

import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import {
    GraduationCap,
    Search,
    Users,
    Database,
} from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import DataTable from "@/components/common/data-table/DataTable";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
    CLASSIFICATION_BADGE_CLASSES,
    CLASSIFICATION_LABELS,
    type AdviserStudentClassification,
} from "@/types/adviser-students";
import {
    DOCUMENT_STATUS_BADGE,
    DOCUMENT_STATUS_LABELS,
    type AdminStudent,
    type DepartmentSummary,
} from "@/types/student";
import { useStudentsPage } from "@/hooks/useStudentsPage";

const STATUS_FILTER_OPTIONS = [
    { value: "all", label: "All Statuses" },
    { value: "complete", label: "Complete" },
    { value: "pending_review", label: "Pending Review" },
    { value: "incomplete", label: "Incomplete" },
    { value: "not_submitted", label: "Not Submitted" },
];

function DepartmentCard({ dept }: { dept: DepartmentSummary }) {
    return (
        <div className="flex w-44 shrink-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <GraduationCap className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    {dept.code}
                </span>
            </div>
            <span className="text-2xl font-bold text-slate-900">{dept.enrolledCount}</span>
            <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${dept.completionPct}%` }}
                    />
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                    {dept.completionPct}% complete
                </span>
            </div>
        </div>
    );
}

function TotalSummaryCard({
    totalEnrolled,
    totalCompleted,
}: {
    totalEnrolled: number;
    totalCompleted: number;
}) {
    const pct = totalEnrolled > 0 ? Math.round((totalCompleted / totalEnrolled) * 100) : 0;
    return (
        <div className="flex w-44 shrink-0 flex-col gap-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-primary/5 to-background p-4 shadow-sm">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15">
                    <Users className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-primary/70">
                    Total
                </span>
            </div>
            <span className="text-2xl font-bold text-slate-900">{totalEnrolled}</span>
            <div className="space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <span className="text-[11px] font-medium text-slate-500">
                    {totalCompleted} completed
                </span>
            </div>
        </div>
    );
}

export default function StudentsPage() {
    const {
        departmentFilter,
        departmentSummaries,
        documentStatusFilter,
        filteredStudents,
        isPageLoading,
        onSchoolYearChange,
        searchQuery,
        selectedSchoolYear,
        schoolYears,
        setDepartmentFilter,
        setDocumentStatusFilter,
        setSearchQuery,
        totalCompleted,
        totalEnrolled,
    } = useStudentsPage();

    const columns = useMemo<ColumnDef<AdminStudent>[]>(
        () => [
            {
                id: "name",
                accessorKey: "name",
                header: "Student Name",
                cell: ({ row }) => {
                    const student = row.original;
                    const initials = student.name
                        .split(" ")
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((n) => n[0]?.toUpperCase() ?? "")
                        .join("");
                    return (
                        <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={student.imageUrl || undefined} />
                                <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-900">
                                    {student.name}
                                </p>
                                <p className="truncate text-xs text-slate-500">{student.email}</p>
                            </div>
                        </div>
                    );
                },
            },
            {
                id: "studentNumber",
                accessorKey: "studentNumber",
                header: "Student ID",
                cell: ({ getValue }) => {
                    const val = getValue<string>();
                    return (
                        <span className="text-sm font-medium text-slate-700">
                            {val || "\u2014"}
                        </span>
                    );
                },
            },
            {
                id: "departmentCode",
                accessorKey: "departmentCode",
                header: "Department",
                cell: ({ row }) => (
                    <Badge variant="outline" className="border-slate-300 text-xs font-medium text-slate-700">
                        {row.original.departmentName || row.original.departmentCode}
                    </Badge>
                ),
            },
            {
                id: "classification",
                accessorKey: "classification",
                header: "Classification",
                cell: ({ getValue }) => {
                    const cls = getValue<AdviserStudentClassification>();
                    const badgeClass = CLASSIFICATION_BADGE_CLASSES[cls] ?? "bg-slate-100 text-slate-700";
                    const label = CLASSIFICATION_LABELS[cls] ?? cls;
                    return (
                        <Badge className={`${badgeClass} border-0 text-xs font-medium`}>
                            {label}
                        </Badge>
                    );
                },
            },
            {
                id: "documentStatus",
                accessorKey: "documentStatus",
                header: "Document Status",
                cell: ({ getValue }) => {
                    const status = getValue<string>();
                    const badgeClass = DOCUMENT_STATUS_BADGE[status] ?? "bg-slate-100 text-slate-700";
                    const label = DOCUMENT_STATUS_LABELS[status] ?? status;
                    return (
                        <Badge className={`${badgeClass} border-0 text-xs font-medium`}>
                            {label}
                        </Badge>
                    );
                },
            },
        ],
        [],
    );

    const mobileCard = (student: AdminStudent) => {
        const initials = student.name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((n) => n[0]?.toUpperCase() ?? "")
            .join("");
        const statusClass = DOCUMENT_STATUS_BADGE[student.documentStatus] ?? "bg-slate-100 text-slate-700";
        const statusLabel = DOCUMENT_STATUS_LABELS[student.documentStatus] ?? student.documentStatus;
        const cls = student.classification as AdviserStudentClassification;
        const clsBadgeClass = CLASSIFICATION_BADGE_CLASSES[cls] ?? "bg-slate-100 text-slate-700";
        const clsLabel = CLASSIFICATION_LABELS[cls] ?? student.classification;

        return (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                        <AvatarImage src={student.imageUrl || undefined} />
                        <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                        <p className="truncate text-xs text-slate-500">{student.email}</p>
                    </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline" className="border-slate-300 text-xs">
                        {student.departmentName || student.departmentCode}
                    </Badge>
                    <Badge className={`${clsBadgeClass} border-0 text-xs`}>{clsLabel}</Badge>
                    <Badge className={`${statusClass} border-0 text-xs`}>{statusLabel}</Badge>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                    ID: {student.studentNumber || "\u2014"}
                </p>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Students"
                description="Track student enrolment lists and document submission statuses across departments."
                actions={
                    <div className="flex items-center gap-2">
                        {schoolYears.length > 0 && (
                            <Select
                                value={selectedSchoolYear?.id ?? "none"}
                                onValueChange={onSchoolYearChange}
                            >
                                <SelectTrigger className="h-9 w-56 text-sm">
                                    <SelectValue placeholder="Select school year" />
                                </SelectTrigger>
                                <SelectContent>
                                    {schoolYears.map((sy) => (
                                        <SelectItem key={sy.id} value={sy.id}>
                                            {sy.name}
                                            {sy.is_active ? " (Active)" : ""}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                }
            />

            {isPageLoading ? (
                <div className="space-y-6">
                    <div className="flex gap-3 overflow-x-auto pb-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-32 w-44 shrink-0 rounded-2xl" />
                        ))}
                    </div>
                    <Skeleton className="h-10 w-full rounded-xl" />
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full rounded-xl" />
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {/* ── Department overview strip ── */}
                    {(departmentSummaries.length > 1 || departmentSummaries.length > 0) && (
                        <div className="overflow-x-auto pb-2">
                            <div className="flex gap-3 min-w-max">
                                {departmentSummaries.map((dept) => (
                                    <DepartmentCard key={dept.code} dept={dept} />
                                ))}
                                {totalEnrolled > 0 && (
                                    <TotalSummaryCard
                                        totalEnrolled={totalEnrolled}
                                        totalCompleted={totalCompleted}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Filter bar ── */}
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-muted/30 p-4 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="Search student name, ID, email, or department..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-9 pl-9 text-sm"
                            />
                        </div>
                        <Select
                            value={documentStatusFilter}
                            onValueChange={setDocumentStatusFilter}
                        >
                            <SelectTrigger className="h-9 w-48 text-sm">
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                {STATUS_FILTER_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select
                            value={departmentFilter}
                            onValueChange={setDepartmentFilter}
                        >
                            <SelectTrigger className="h-9 w-56 text-sm">
                                <SelectValue placeholder="Filter by department" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Departments</SelectItem>
                                {departmentSummaries.map((dept) => (
                                    <SelectItem key={dept.code} value={dept.code}>
                                        {dept.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* ── Student table ── */}
                    {filteredStudents.length === 0 && !isPageLoading ? (
                        <AdminEmptyState
                            icon={<Database className="h-10 w-10 text-slate-400" />}
                            title="No students found"
                            description={
                                selectedSchoolYear
                                    ? `No student records exist for ${selectedSchoolYear.name}.`
                                    : "No student records match your search or filter."
                            }
                        />
                    ) : (
                        <DataTable
                            data={filteredStudents}
                            columns={columns}
                            mobileCard={mobileCard}
                            pageSize={10}
                        />
                    )}
                </>
            )}
        </div>
    );
}
