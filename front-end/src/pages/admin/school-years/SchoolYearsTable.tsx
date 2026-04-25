import { ArrowUpDown, CheckCircle2, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import {
    type ColumnDef,
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    type OnChangeFn,
    type SortingState,
    useReactTable,
} from "@tanstack/react-table";

import AdminEmptyState from "@/components/admin/AdminEmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
    formatSchoolYearDate,
    SCHOOL_YEAR_STATUS_BADGE_STYLE,
    SCHOOL_YEAR_STATUS_LABEL,
} from "@/lib/school-year-utils";
import type { SchoolYearRecord, SchoolYearStatus } from "@/types/schoolYear";

type StatusFilter = "all" | SchoolYearStatus;

interface SchoolYearsTableProps {
    filteredSchoolYears: SchoolYearRecord[];
    handleQuickActivate: (schoolYear: SchoolYearRecord) => void;
    openCreateDialog: () => void;
    openEditDialog: (schoolYear: SchoolYearRecord) => void;
    openRolloverDialog: (schoolYear: SchoolYearRecord) => void;
    openViewDialog: (schoolYear: SchoolYearRecord) => void;
    schoolYears: SchoolYearRecord[];
    searchQuery: string;
    setSchoolYearToClose: (schoolYear: SchoolYearRecord | null) => void;
    setSchoolYearToDeactivate: (schoolYear: SchoolYearRecord | null) => void;
    setSchoolYearToReopen: (schoolYear: SchoolYearRecord | null) => void;
    setSearchQuery: (query: string) => void;
    setStatusFilter: (status: StatusFilter) => void;
    statusFilter: StatusFilter;
}

export default function SchoolYearsTable({
    filteredSchoolYears,
    handleQuickActivate,
    openCreateDialog,
    openEditDialog,
    openRolloverDialog,
    openViewDialog,
    schoolYears,
    searchQuery,
    setSchoolYearToClose,
    setSchoolYearToDeactivate,
    setSchoolYearToReopen,
    setSearchQuery,
    setStatusFilter,
    statusFilter,
}: SchoolYearsTableProps) {
    const defaultSchoolYearSorting: SortingState = [
        { id: "is_active", desc: true },
        { id: "start_date", desc: false },
    ];
    const [sorting, setSorting] = useState<SortingState>(defaultSchoolYearSorting);

    const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
        setSorting((current) => {
            const nextSorting = typeof updater === "function" ? updater(current) : updater;
            const nextWithoutActive = nextSorting.filter((item) => item.id !== "is_active");
            return [
                { id: "is_active", desc: true },
                ...(nextWithoutActive.length > 0 ? nextWithoutActive : [{ id: "start_date", desc: false }]),
            ];
        });
    };

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
                accessorKey: "is_ready",
                header: ({ column }) => (
                    <Button
                        variant="ghost"
                        className="px-0 hover:bg-transparent"
                        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                    >
                        Ready
                        <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                    </Button>
                ),
                cell: ({ row }) =>
                    row.original.is_ready ? (
                        <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                            <CheckCircle2 className="mr-1 h-3 w-3" />
                            Ready
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="border-amber-600 text-amber-700">
                            <XCircle className="mr-1 h-3 w-3" />
                            Needs Setup
                        </Badge>
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
                        <Button variant="ghost" size="sm" onClick={() => openRolloverDialog(row.original)}>
                            Rollover
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
                        {row.original.status === "closed" ? (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-emerald-700 hover:text-emerald-700"
                                onClick={() => setSchoolYearToReopen(row.original)}
                            >
                                Reopen
                            </Button>
                        ) : null}
                    </div>
                ),
            },
        ],
        [
            handleQuickActivate,
            openEditDialog,
            openRolloverDialog,
            openViewDialog,
            setSchoolYearToClose,
            setSchoolYearToDeactivate,
            setSchoolYearToReopen,
        ],
    );

    const table = useReactTable({
        data: filteredSchoolYears,
        columns,
        state: { sorting },
        onSortingChange: handleSortingChange,
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

    return (
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
                    <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as StatusFilter)}>
                        <SelectTrigger className="w-full sm:w-45">
                            <SelectValue placeholder="Filter status" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="upcoming">Open</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="closed">Closed / Archived</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {schoolYears.length === 0 ? (
                    <AdminEmptyState
                        className="p-10"
                        title="No school year has been created yet."
                        action={<Button onClick={openCreateDialog}>Create First School Year</Button>}
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
                                            <TableHead
                                                key={header.id}
                                                className={header.column.id === "actions" ? "text-right" : undefined}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(header.column.columnDef.header, header.getContext())}
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
    );
}
