import { AlertTriangle, ArrowUpDown, CalendarDays, Loader2, PencilLine, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type SortingState,
    useReactTable,
} from "@tanstack/react-table";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import SchoolYearFormDialog from "@/components/admin/school-years/SchoolYearFormDialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { useSchoolYearsPage } from "@/hooks/useSchoolYearsPage";
import {
    formatSchoolYearDate,
    formatSchoolYearDateTime,
    SCHOOL_YEAR_STATUS_BADGE_STYLE,
    SCHOOL_YEAR_STATUS_LABEL,
} from "@/lib/school-year-utils";
import type { SchoolYearRecord } from "@/types/schoolYear";

export default function SchoolYearsPage() {
    const {
        activationIntent,
        activeSchoolYear,
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
        closeSchoolYear,
    } = useSchoolYearsPage();
    const [sorting, setSorting] = useState<SortingState>([]);

    const columns = useMemo<ColumnDef<SchoolYearRecord>[]>(
        () => [
            {
                accessorKey: "name",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        School Year
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
            },
            {
                accessorKey: "start_date",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Start Date
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) => formatSchoolYearDate(row.original.start_date),
            },
            {
                accessorKey: "end_date",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        End Date
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) => formatSchoolYearDate(row.original.end_date),
            },
            {
                accessorKey: "status",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Status
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) => (
                    <Badge className={SCHOOL_YEAR_STATUS_BADGE_STYLE[row.original.status]}>
                        {SCHOOL_YEAR_STATUS_LABEL[row.original.status]}
                    </Badge>
                ),
            },
            {
                accessorKey: "is_active",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Active
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) =>
                    row.original.is_active ? (
                        <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                            Yes
                        </Badge>
                    ) : (
                        <span className="text-muted-foreground">No</span>
                    ),
            },
            {
                id: "actions",
                header: "Actions",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openViewDialog(row.original)}>
                            View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(row.original)}>
                            Edit
                        </Button>
                        {row.original.is_active ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSchoolYearToDeactivate(row.original)}
                            >
                                Set as Inactive
                            </Button>
                        ) : (
                            <Button
                                variant="ghost"
                                size="sm"
                                disabled={row.original.status === "closed"}
                                onClick={() => handleQuickActivate(row.original)}
                            >
                                Set as Active
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            disabled={row.original.status === "closed"}
                            className="text-amber-700 hover:text-amber-700"
                            onClick={() => setSchoolYearToClose(row.original)}
                        >
                            Close
                        </Button>
                    </div>
                ),
            },
        ],
        [handleQuickActivate, openEditDialog, openViewDialog, setSchoolYearToClose, setSchoolYearToDeactivate],
    );

    const table = useReactTable({
        data: filteredSchoolYears,
        columns,
        state: { sorting },
        onSortingChange: setSorting,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        initialState: {
            pagination: {
                pageSize: 10,
            },
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading school years...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="School Year"
                description="Manage academic years used for submissions, adviser assignments, document templates, and records."
                className="sm:items-start"
                actions={(
                    <Button onClick={openCreateDialog}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add New School Year
                    </Button>
                )}
            />

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
                                    <p className="font-medium text-foreground">Date Created</p>
                                    <p>{formatSchoolYearDateTime(activeSchoolYear.created_at)}</p>
                                </div>
                                <div>
                                    <p className="font-medium text-foreground">Last Updated</p>
                                    <p>{formatSchoolYearDateTime(activeSchoolYear.updated_at)}</p>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button variant="outline" onClick={() => openEditDialog(activeSchoolYear)}>
                                    <PencilLine className="mr-2 h-4 w-4" />
                                    Edit
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setSchoolYearToDeactivate(activeSchoolYear)}
                                >
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

            <Card>
                <CardHeader>
                    <CardTitle>School Year List</CardTitle>
                    <CardDescription>
                        Review all school years, update details, and switch which one is active.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search school years..."
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <Select
                            value={statusFilter}
                            onValueChange={(value) => setStatusFilter(value as "all" | "upcoming" | "active" | "closed")}
                        >
                            <SelectTrigger className="w-full sm:w-45">
                                <SelectValue placeholder="Filter status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="upcoming">Upcoming</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="closed">Closed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {schoolYears.length === 0 ? (
                        <AdminEmptyState
                            className="p-10"
                            title="No school year has been created yet."
                            action={(
                                <Button onClick={openCreateDialog}>
                                    Create First School Year
                                </Button>
                            )}
                        />
                    ) : filteredSchoolYears.length === 0 ? (
                        <AdminEmptyState
                            title="No school years found"
                            description="No school years matched your current search and filter."
                        />
                    ) : (
                        <div className="space-y-3">
                            <Table>
                                <TableHeader>
                                    {table.getHeaderGroups().map((headerGroup) => (
                                        <TableRow key={headerGroup.id}>
                                            {headerGroup.headers.map((header) => (
                                                <TableHead key={header.id} className={header.column.id === "actions" ? "text-right" : undefined}>
                                                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableHeader>
                                <TableBody>
                                    {table.getRowModel().rows.length > 0 ? (
                                        table.getRowModel().rows.map((row) => (
                                            <TableRow key={row.id}>
                                                {row.getVisibleCells().map((cell) => (
                                                    <TableCell key={cell.id}>
                                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                                                No school years found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Showing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length} school years
                                </p>
                                <div className="flex items-center gap-2">
                                    <Select
                                        value={String(table.getState().pagination.pageSize)}
                                        onValueChange={(value) => table.setPageSize(Number(value))}
                                    >
                                        <SelectTrigger className="w-28">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="5">5 / page</SelectItem>
                                            <SelectItem value="10">10 / page</SelectItem>
                                            <SelectItem value="20">20 / page</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => table.previousPage()}
                                        disabled={!table.getCanPreviousPage()}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => table.nextPage()}
                                        disabled={!table.getCanNextPage()}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <SchoolYearFormDialog
                open={isFormOpen}
                onOpenChange={handleFormOpenChange}
                form={formData}
                onChange={setFormData}
                isSubmitting={isSaving}
                onSubmit={() => submitSchoolYear()}
                title={editingSchoolYear ? "Edit School Year" : "Add School Year"}
                submitLabel="Save"
                submittingLabel="Saving..."
            />

            <Dialog open={isViewOpen} onOpenChange={handleViewOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>School Year Details</DialogTitle>
                        <DialogDescription>Review the selected school year information.</DialogDescription>
                    </DialogHeader>
                    {viewingSchoolYear ? (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <p className="text-muted-foreground">School Year</p>
                                <p className="font-medium text-foreground">{viewingSchoolYear.name}</p>
                                <p className="text-muted-foreground">Start Date</p>
                                <p className="font-medium text-foreground">{formatSchoolYearDate(viewingSchoolYear.start_date)}</p>
                                <p className="text-muted-foreground">End Date</p>
                                <p className="font-medium text-foreground">{formatSchoolYearDate(viewingSchoolYear.end_date)}</p>
                                <p className="text-muted-foreground">Status</p>
                                <p className="font-medium text-foreground">{SCHOOL_YEAR_STATUS_LABEL[viewingSchoolYear.status]}</p>
                                <p className="text-muted-foreground">Active</p>
                                <p className="font-medium text-foreground">{viewingSchoolYear.is_active ? "Yes" : "No"}</p>
                                <p className="text-muted-foreground">Last Updated</p>
                                <p className="font-medium text-foreground">{formatSchoolYearDateTime(viewingSchoolYear.updated_at)}</p>
                            </div>
                            <div className="space-y-2 rounded-md border p-3">
                                <p className="text-sm font-medium text-foreground">Assigned Departments</p>
                                {isAssignmentsLoading ? (
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading assignments...
                                    </div>
                                ) : schoolYearAssignments.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No departments found.</p>
                                ) : (
                                    <div className="space-y-1">
                                        {schoolYearAssignments.map((assignment) => (
                                            <p key={assignment.department_id} className="text-sm text-foreground">
                                                {assignment.department_code} - {assignment.adviser_name ?? "none"}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => handleViewOpenChange(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={activationIntent !== null} onOpenChange={(open) => (!open ? setActivationIntent(null) : null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Set School Year as Active?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Setting this school year as active will apply it to all new submissions and records.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmActivation}>Confirm</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={schoolYearToDeactivate !== null}
                onOpenChange={(open) => (!open ? setSchoolYearToDeactivate(null) : null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Set School Year as Inactive?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {schoolYearToDeactivate
                                ? `This will set ${schoolYearToDeactivate.name} as inactive for new transactions until another school year is activated.`
                                : "This action will set the selected school year as inactive."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => schoolYearToDeactivate && void setSchoolYearInactive(schoolYearToDeactivate)}
                        >
                            Confirm Inactive
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog
                open={schoolYearToClose !== null}
                onOpenChange={(open) => (!open ? setSchoolYearToClose(null) : null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Mark School Year as Closed?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {schoolYearToClose
                                ? `This will close ${schoolYearToClose.name}. Existing records are preserved, but new transactions will no longer use it.`
                                : "This action will close the selected school year."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => schoolYearToClose && void closeSchoolYear(schoolYearToClose)}>
                            Confirm Close
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
