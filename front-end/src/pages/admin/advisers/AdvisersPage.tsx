import { ArrowUpDown, Plus, Search, User } from "lucide-react";
import { useMemo, useState } from "react";
import {
    type ColumnDef,
    type ColumnFiltersState,
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
import AdviserAssignmentHistoryDialog from "@/components/admin/advisers/AdviserAssignmentHistoryDialog";
import AdviserFormDialog from "@/components/admin/advisers/AdviserFormDialog";
import AdviserInvitationsTab from "@/components/admin/advisers/AdviserInvitationsTab";
import DeleteAdviserDialog from "@/components/admin/advisers/DeleteAdviserDialog";
import DepartmentFormDialog from "@/components/admin/departments/DepartmentFormDialog";
import SchoolYearFormDialog from "@/components/admin/school-years/SchoolYearFormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAdvisersPage } from "@/hooks/useAdvisersPage";
import type { Adviser } from "@/types/adviser";

export default function AdvisersPage() {
    const {
        activeSchoolYearName,
        adviserInvitations,
        addDepartmentValue,
        addSchoolYearValue,
        departmentCreateForm,
        departmentFormError,
        departments,
        filteredAdvisers,
        formData,
        handleAddAdviser,
        handleCreateDepartmentOption,
        handleCreateSchoolYearOption,
        handleDeleteAdviser,
        handleDepartmentCodesChange,
        handleDepartmentSelect,
        handleEditAdviser,
        handleHistoryDialogOpenChange,
        handleSchoolYearSelect,
        historyAdviser,
        historyRecords,
        isAddDepartmentDialogOpen,
        isAddDialogOpen,
        isAddSchoolYearDialogOpen,
        isAddingAdviser,
        isAddingDepartment,
        isAddingSchoolYear,
        isDeleteDialogOpen,
        isEditDialogOpen,
        isEditingAdviser,
        isFormValid,
        isHistoryDialogOpen,
        isHistoryLoading,
        isPageLoading,
        openAddDialog,
        openDeleteDialog,
        openEditDialog,
        openHistoryDialog,
        revokeAdviserInvitation,
        revokingInvitationId,
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
    } = useAdvisersPage();
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [activeTab, setActiveTab] = useState<"advisers" | "invitations">("advisers");

    const columns = useMemo<ColumnDef<Adviser>[]>(
        () => [
            {
                accessorKey: "name",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Name
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
            },
            {
                accessorKey: "email",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Email
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) => row.original.email ?? "No email",
            },
            {
                accessorKey: "isActive",
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
                    <Badge
                        className={
                            row.original.isActive
                                ? "bg-green-500/10 text-green-700 hover:bg-green-500/10"
                                : "bg-red-500/10 text-red-700 hover:bg-red-500/10"
                        }
                    >
                        {row.original.isActive ? "Active" : "Inactive"}
                    </Badge>
                ),
                filterFn: (row, columnId, filterValue) => {
                    if (filterValue === "all") return true;
                    return String(row.getValue(columnId)) === String(filterValue === "active");
                },
            },
            {
                id: "assignment",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Current Assignment
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                accessorFn: (row) => row.department ?? "",
                cell: ({ row }) =>
                    row.original.department ? (
                        <div className="space-y-1">
                            <p className="font-medium text-foreground">{row.original.department}</p>
                            <p className="text-xs text-muted-foreground">
                                S.Y. {row.original.schoolYear ?? activeSchoolYearName ?? "N/A"}
                            </p>
                        </div>
                    ) : (
                        <span className="text-sm text-muted-foreground">Unassigned</span>
                    ),
            },
            {
                id: "actions",
                header: "Actions",
                enableSorting: false,
                cell: ({ row }) => (
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openHistoryDialog(row.original)}>
                            View History
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(row.original)}>
                            Edit
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void toggleAdviserStatus(row.original)}
                            disabled={statusUpdatingId === row.original.id}
                        >
                            {row.original.isActive ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => openDeleteDialog(row.original)}
                        >
                            Delete
                        </Button>
                    </div>
                ),
            },
        ],
        [
            activeSchoolYearName,
            openDeleteDialog,
            openEditDialog,
            openHistoryDialog,
            statusUpdatingId,
            toggleAdviserStatus,
        ],
    );

    const table = useReactTable({
        data: filteredAdvisers,
        columns,
        state: { sorting, columnFilters },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
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

    if (isPageLoading) {
        return <p className="text-sm text-muted-foreground">Loading advisers...</p>;
    }

    return (
        <div className="space-y-6">
            <AdminPageHeader
                title="Advisers"
                description={
                    activeSchoolYearName
                        ? `Master list of advisers and their current assignment for active school year ${activeSchoolYearName}.`
                        : "Master list of advisers and their current department assignment."
                }
                actions={activeTab === "advisers" ? (
                    <Button onClick={openAddDialog}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add New Adviser
                    </Button>
                ) : undefined}
            />

            <div className="inline-flex rounded-lg border bg-muted/30 p-1">
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "advisers" ? "default" : "ghost"}
                    onClick={() => setActiveTab("advisers")}
                >
                    Advisers
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "invitations" ? "default" : "ghost"}
                    onClick={() => setActiveTab("invitations")}
                >
                    Invitations
                </Button>
            </div>

            {activeTab === "advisers" ? (
                <>
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search advisers by name, email, department, or school year..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {filteredAdvisers.length === 0 ? (
                        <AdminEmptyState
                            className="py-12"
                            icon={<User className="h-12 w-12 text-muted-foreground" />}
                            title="No advisers found"
                            description="Try adjusting your search or add a new adviser."
                        />
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-end">
                                <Select
                                    value={(table.getColumn("isActive")?.getFilterValue() as string) ?? "all"}
                                    onValueChange={(value) =>
                                        table.getColumn("isActive")?.setFilterValue(value === "all" ? "all" : value)
                                    }
                                >
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="Filter status" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Status</SelectItem>
                                        <SelectItem value="active">Active</SelectItem>
                                        <SelectItem value="inactive">Inactive</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="rounded-lg border">
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
                                                    No advisers found.
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Showing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length} advisers
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
                </>
            ) : (
                <AdviserInvitationsTab
                    invitations={adviserInvitations}
                    revokingInvitationId={revokingInvitationId}
                    onRevokeInvitation={revokeAdviserInvitation}
                />
            )}

            <AdviserFormDialog
                mode="add"
                open={isAddDialogOpen}
                onOpenChange={setIsAddDialogOpen}
                formData={formData}
                onFormChange={setFormData}
                departments={departments}
                schoolYears={schoolYears}
                addDepartmentValue={addDepartmentValue}
                addSchoolYearValue={addSchoolYearValue}
                onDepartmentCodesChange={handleDepartmentCodesChange}
                onDepartmentSelect={handleDepartmentSelect}
                onSchoolYearSelect={handleSchoolYearSelect}
                isFormValid={isFormValid}
                isSubmitting={isAddingAdviser}
                onSubmit={handleAddAdviser}
            />

            <AdviserFormDialog
                mode="edit"
                open={isEditDialogOpen}
                onOpenChange={setIsEditDialogOpen}
                formData={formData}
                onFormChange={setFormData}
                departments={departments}
                schoolYears={schoolYears}
                addDepartmentValue={addDepartmentValue}
                addSchoolYearValue={addSchoolYearValue}
                onDepartmentCodesChange={handleDepartmentCodesChange}
                onDepartmentSelect={handleDepartmentSelect}
                onSchoolYearSelect={handleSchoolYearSelect}
                isFormValid={isFormValid}
                isSubmitting={isEditingAdviser}
                onSubmit={handleEditAdviser}
            />

            <DepartmentFormDialog
                open={isAddDepartmentDialogOpen}
                onOpenChange={setIsAddDepartmentDialogOpen}
                title="Add Department"
                submitLabel="Add Department"
                submittingLabel="Adding..."
                form={departmentCreateForm}
                onChange={setDepartmentCreateForm}
                error={departmentFormError}
                isSubmitting={isAddingDepartment}
                onSubmit={handleCreateDepartmentOption}
            />

            <SchoolYearFormDialog
                open={isAddSchoolYearDialogOpen}
                onOpenChange={setIsAddSchoolYearDialogOpen}
                form={schoolYearCreateForm}
                onChange={setSchoolYearCreateForm}
                error={schoolYearFormError}
                isSubmitting={isAddingSchoolYear}
                onSubmit={handleCreateSchoolYearOption}
                title="Add School Year"
                submitLabel="Add School Year"
                submittingLabel="Adding..."
            />

            <DeleteAdviserDialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                adviserName={selectedAdviser?.name ?? null}
                onConfirm={handleDeleteAdviser}
            />

            <AdviserAssignmentHistoryDialog
                open={isHistoryDialogOpen}
                onOpenChange={handleHistoryDialogOpenChange}
                adviserName={historyAdviser?.name ?? null}
                isLoading={isHistoryLoading}
                assignments={historyRecords}
            />

        </div>
    );
}
