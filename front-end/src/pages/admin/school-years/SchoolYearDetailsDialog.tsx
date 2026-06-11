import { History, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    formatSchoolYearDate,
    formatSchoolYearDateTime,
    SCHOOL_YEAR_STATUS_BADGE_STYLE,
    SCHOOL_YEAR_STATUS_LABEL,
} from "@/lib/school-year-utils";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type { RequirementAssignmentResponse } from "@/types/requirement";
import type { SchoolYearAuditLog, SchoolYearDepartmentAssignment, SchoolYearRecord } from "@/types/schoolYear";

interface SchoolYearDetailsDialogProps {
    handleViewOpenChange: (open: boolean) => void;
    isAssignmentsLoading: boolean;
    isAuditLogsLoading: boolean;
    isRequirementsLoading: boolean;
    isViewOpen: boolean;
    schoolYearAssignments: SchoolYearDepartmentAssignment[];
    schoolYearAuditLogs: SchoolYearAuditLog[];
    schoolYearRequirements: RequirementAssignmentResponse | null;
    documentTypes: DocumentTypeApiRecord[];
    extractionSchemas: ExtractionSchemaRecord[];
    viewingSchoolYear: SchoolYearRecord | null;
}

export default function SchoolYearDetailsDialog({
    handleViewOpenChange,
    isAssignmentsLoading,
    isAuditLogsLoading,
    isRequirementsLoading,
    isViewOpen,
    schoolYearAssignments,
    schoolYearAuditLogs,
    schoolYearRequirements,
    documentTypes,
    extractionSchemas,
    viewingSchoolYear,
}: SchoolYearDetailsDialogProps) {
    return (
        <Dialog open={isViewOpen} onOpenChange={handleViewOpenChange}>
            <DialogContent className="flex h-[88vh] max-h-[88vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 sm:max-w-3xl">
                <DialogHeader className="shrink-0 border-b px-5 pb-4 pt-5">
                    <DialogTitle>School Year Details</DialogTitle>
                    <DialogDescription>Review the selected school year information.</DialogDescription>
                </DialogHeader>
                {viewingSchoolYear ? (
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-semibold text-foreground">{viewingSchoolYear.name}</h3>
                            <Badge className={SCHOOL_YEAR_STATUS_BADGE_STYLE[viewingSchoolYear.status]}>
                                {SCHOOL_YEAR_STATUS_LABEL[viewingSchoolYear.status]}
                            </Badge>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Start Date</p>
                                <p className="font-medium text-foreground">{formatSchoolYearDate(viewingSchoolYear.start_date)}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">End Date</p>
                                <p className="font-medium text-foreground">{formatSchoolYearDate(viewingSchoolYear.end_date)}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Auto Closure</p>
                                <p className="font-medium text-foreground">
                                    {viewingSchoolYear.auto_closure_date ? formatSchoolYearDate(viewingSchoolYear.auto_closure_date) : "Not set"}
                                </p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Last Updated</p>
                                <p className="font-medium text-foreground">{formatSchoolYearDateTime(viewingSchoolYear.updated_at)}</p>
                            </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Readiness</p>
                                <p className="font-medium text-foreground">{viewingSchoolYear.is_ready ? "Ready" : "Needs setup"}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Requirements</p>
                                <p className="font-medium text-foreground">{viewingSchoolYear.requirement_count}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Adviser Assignments</p>
                                <p className="font-medium text-foreground">{viewingSchoolYear.adviser_assignment_count}</p>
                            </div>
                            <div className="rounded-md border p-3">
                                <p className="text-xs text-muted-foreground">Departments</p>
                                <p className="font-medium text-foreground">{viewingSchoolYear.active_department_count}</p>
                            </div>
                        </div>
                        <div className="space-y-2 rounded-md border p-3">
                            <p className="text-sm font-medium text-foreground">Readiness Issues</p>
                            {viewingSchoolYear.readiness_issues.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No readiness issues found.</p>
                            ) : (
                                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                                    {viewingSchoolYear.readiness_issues.map((issue) => (
                                        <li key={issue}>{issue}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <div className="space-y-2 rounded-md border p-3">
                            <p className="text-sm font-medium text-foreground">Assigned Departments</p>
                            {isAssignmentsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading assignments...
                                </div>
                            ) : (
                                (() => {
                                    const activeAssignments = schoolYearAssignments.filter(
                                        (a) => a.department_is_active,
                                    );
                                    if (activeAssignments.length === 0) {
                                        return <p className="text-sm text-muted-foreground">No active departments found.</p>;
                                    }
                                    return (
                                        <div className="grid max-h-48 gap-2 overflow-auto sm:grid-cols-2">
                                            {activeAssignments.map((assignment) => (
                                                <div key={assignment.department_id} className="rounded-md bg-muted/40 px-3 py-2">
                                                    <p className="text-sm font-medium text-foreground">{assignment.department_code}</p>
                                                    <p className="text-xs text-muted-foreground">{assignment.adviser_name ?? "No adviser assigned"}</p>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()
                            )}
                        </div>
                        <div className="space-y-2 rounded-md border p-3">
                            <p className="text-sm font-medium text-foreground">Document Requirements</p>
                            {isRequirementsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading requirements...
                                </div>
                            ) : !schoolYearRequirements || schoolYearRequirements.requirements.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No requirements set for this school year.</p>
                            ) : (
                                <div className="grid max-h-48 gap-2 overflow-auto sm:grid-cols-2">
                                    {schoolYearRequirements.requirements.map((requirement) => {
                                        const docType = documentTypes.find(
                                            (item) => item.id === requirement.document_type_id,
                                        );
                                        const schema = requirement.extraction_schema_id
                                            ? extractionSchemas.find(
                                                  (item) => item.id === requirement.extraction_schema_id,
                                              )
                                            : null;
                                        return (
                                            <div
                                                key={requirement.document_type_id}
                                                className="rounded-md bg-muted/40 px-3 py-2"
                                            >
                                                <p className="text-sm font-medium text-foreground">
                                                    {docType?.name ?? requirement.document_type_id}
                                                </p>
                                                {schema ? (
                                                    <p className="text-xs text-muted-foreground">
                                                        Schema: {schema.name}
                                                        {schema.version_label ? ` (${schema.version_label})` : ""}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">
                                                        {docType?.code ?? "Unknown"}
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                        <div className="space-y-2 rounded-md border p-3">
                            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                                <History className="h-4 w-4" />
                                Audit History
                            </p>
                            {isAuditLogsLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading audit history...
                                </div>
                            ) : schoolYearAuditLogs.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No audit history found.</p>
                            ) : (
                                <div className="max-h-48 space-y-2 overflow-auto">
                                    {schoolYearAuditLogs.map((log) => (
                                        <div key={log.id} className="rounded-md bg-muted/40 px-3 py-2 text-sm">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="font-medium capitalize text-foreground">
                                                    {log.action.replace("-", " ")}
                                                </span>
                                                <span className="text-xs text-muted-foreground">
                                                    {formatSchoolYearDateTime(log.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                Actor: {log.actor_name ?? "System/unknown"}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
                <DialogFooter className="mt-0 shrink-0">
                    <Button variant="outline" onClick={() => handleViewOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
