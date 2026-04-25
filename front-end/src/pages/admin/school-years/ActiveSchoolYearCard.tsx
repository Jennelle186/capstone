import { CalendarDays, Copy, PencilLine, Plus } from "lucide-react";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    formatSchoolYearDate,
    formatSchoolYearDateTime,
    SCHOOL_YEAR_STATUS_BADGE_STYLE,
    SCHOOL_YEAR_STATUS_LABEL,
} from "@/lib/school-year-utils";
import type { SchoolYearRecord } from "@/types/schoolYear";

interface ActiveSchoolYearCardProps {
    activeSchoolYear: SchoolYearRecord | null;
    openCreateDialog: () => void;
    openEditDialog: (schoolYear: SchoolYearRecord) => void;
    openRolloverDialog: (schoolYear: SchoolYearRecord) => void;
    setSchoolYearToClose: (schoolYear: SchoolYearRecord | null) => void;
    setSchoolYearToDeactivate: (schoolYear: SchoolYearRecord | null) => void;
}

export default function ActiveSchoolYearCard({
    activeSchoolYear,
    openCreateDialog,
    openEditDialog,
    openRolloverDialog,
    setSchoolYearToClose,
    setSchoolYearToDeactivate,
}: ActiveSchoolYearCardProps) {
    return (
        <Card className="border-l-4 border-l-emerald-600 shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                    <CalendarDays className="h-5 w-5 text-emerald-700" />
                    Current Active School Year
                </CardTitle>
                <CardDescription>
                    This school year is currently used by the system for all new records and transactions.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {activeSchoolYear ? (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xl font-semibold text-foreground">{activeSchoolYear.name}</span>
                            <Badge className={SCHOOL_YEAR_STATUS_BADGE_STYLE[activeSchoolYear.status]}>
                                {SCHOOL_YEAR_STATUS_LABEL[activeSchoolYear.status]}
                            </Badge>
                        </div>
                        <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                            <div>
                                <p className="font-medium text-foreground">Start Date</p>
                                <p>{formatSchoolYearDate(activeSchoolYear.start_date)}</p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">End Date</p>
                                <p>{formatSchoolYearDate(activeSchoolYear.end_date)}</p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Auto Closure Date</p>
                                <p>
                                    {activeSchoolYear.auto_closure_date
                                        ? formatSchoolYearDate(activeSchoolYear.auto_closure_date)
                                        : "Not set"}
                                </p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Last Updated</p>
                                <p>{formatSchoolYearDateTime(activeSchoolYear.updated_at)}</p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Readiness</p>
                                <p>{activeSchoolYear.is_ready ? "Ready" : "Needs setup"}</p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Assignments</p>
                                <p>
                                    {activeSchoolYear.adviser_assignment_count} / {activeSchoolYear.active_department_count}
                                </p>
                            </div>
                            <div>
                                <p className="font-medium text-foreground">Requirements</p>
                                <p>{activeSchoolYear.requirement_count}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" onClick={() => openEditDialog(activeSchoolYear)}>
                                <PencilLine className="mr-2 h-4 w-4" />
                                Edit
                            </Button>
                            <Button variant="outline" onClick={() => setSchoolYearToDeactivate(activeSchoolYear)}>
                                Set as Inactive
                            </Button>
                            <Button
                                variant="outline"
                                className="text-amber-700 hover:text-amber-700"
                                onClick={() => setSchoolYearToClose(activeSchoolYear)}
                            >
                                Mark as Closed
                            </Button>
                            <Button onClick={openCreateDialog}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add New School Year
                            </Button>
                            <Button variant="outline" onClick={() => openRolloverDialog(activeSchoolYear)}>
                                <Copy className="mr-2 h-4 w-4" />
                                Rollover
                            </Button>
                        </div>
                    </div>
                ) : (
                    <AdminEmptyState
                        className="p-6"
                        title="No active school year yet."
                        description="Create and activate a school year so new transactions can use it."
                        action={(
                            <Button onClick={openCreateDialog}>
                                <Plus className="mr-2 h-4 w-4" />
                                Create First School Year
                            </Button>
                        )}
                    />
                )}
            </CardContent>
        </Card>
    );
}
