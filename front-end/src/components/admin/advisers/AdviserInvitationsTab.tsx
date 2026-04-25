import { ArrowUpDown, Search } from "lucide-react";
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

import RevokeAdviserInvitationDialog from "@/components/admin/advisers/RevokeAdviserInvitationDialog";
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
import type { AdviserInvitationRecord } from "@/types/adviser";

interface AdviserInvitationsTabProps {
    invitations: AdviserInvitationRecord[];
    revokingInvitationId: string | null;
    onRevokeInvitation: (invitation: AdviserInvitationRecord) => Promise<void>;
}

const INVITATION_STATUS_BADGE_CLASS: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 hover:bg-amber-500/10",
    accepted: "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10",
    revoked: "bg-rose-500/10 text-rose-700 hover:bg-rose-500/10",
    expired: "bg-slate-400/10 text-slate-700 hover:bg-slate-400/10",
};

function formatDateTime(value: string | null) {
    if (!value) return "N/A";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatInvitationStatus(value: string) {
    if (!value) return value;
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function buildInvitationName(invitation: AdviserInvitationRecord) {
    return [invitation.first_name, invitation.middle_name, invitation.last_name]
        .filter(Boolean)
        .join(" ");
}

export default function AdviserInvitationsTab({
    invitations,
    revokingInvitationId,
    onRevokeInvitation,
}: AdviserInvitationsTabProps) {
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
    const [selectedInvitation, setSelectedInvitation] = useState<AdviserInvitationRecord | null>(null);

    // Keep search behavior local to this tab so page-level adviser search state stays independent.
    const filteredInvitations = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();
        if (!normalizedQuery) return invitations;

        return invitations.filter((invitation) => {
            const fullName = buildInvitationName(invitation).toLowerCase();
            return (
                invitation.email.toLowerCase().includes(normalizedQuery) ||
                fullName.includes(normalizedQuery) ||
                (invitation.department_code ?? "").toLowerCase().includes(normalizedQuery) ||
                (invitation.school_year_name ?? "").toLowerCase().includes(normalizedQuery) ||
                invitation.status.toLowerCase().includes(normalizedQuery)
            );
        });
    }, [invitations, searchQuery]);

    const openRevokeDialog = (invitation: AdviserInvitationRecord) => {
        setSelectedInvitation(invitation);
        setIsRevokeDialogOpen(true);
    };

    const columns: ColumnDef<AdviserInvitationRecord>[] = [
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
            cell: ({ row }) => row.original.email,
        },
        {
            id: "name",
            accessorFn: (row) => buildInvitationName(row),
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
            cell: ({ row }) => buildInvitationName(row.original) || "N/A",
        },
        {
            accessorKey: "department_code",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    className="px-0 hover:bg-transparent"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Department
                    <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                </Button>
            ),
            cell: ({ row }) => row.original.department_code ?? "N/A",
        },
        {
            accessorKey: "school_year_name",
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
            cell: ({ row }) => row.original.school_year_name ?? "N/A",
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
                <Badge className={INVITATION_STATUS_BADGE_CLASS[row.original.status] ?? INVITATION_STATUS_BADGE_CLASS.pending}>
                    {formatInvitationStatus(row.original.status)}
                </Badge>
            ),
            filterFn: (row, columnId, filterValue) => {
                if (filterValue === "all") return true;
                return String(row.getValue(columnId)) === String(filterValue);
            },
        },
        {
            accessorKey: "created_at",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    className="px-0 hover:bg-transparent"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Created
                    <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                </Button>
            ),
            cell: ({ row }) => formatDateTime(row.original.created_at),
        },
        {
            accessorKey: "accepted_at",
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    className="px-0 hover:bg-transparent"
                    onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
                >
                    Accepted
                    <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
                </Button>
            ),
            cell: ({ row }) => formatDateTime(row.original.accepted_at),
        },
        {
            id: "actions",
            header: "Actions",
            enableSorting: false,
            cell: ({ row }) => (
                <div className="flex justify-end">
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={row.original.status !== "pending" || revokingInvitationId === row.original.id}
                        onClick={() => openRevokeDialog(row.original)}
                    >
                        {revokingInvitationId === row.original.id ? "Revoking..." : "Revoke"}
                    </Button>
                </div>
            ),
        },
    ];

    const table = useReactTable({
        data: filteredInvitations,
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

    const handleRevokeDialogChange = (open: boolean) => {
        setIsRevokeDialogOpen(open);
        if (!open) {
            setSelectedInvitation(null);
        }
    };

    const handleConfirmRevokeInvitation = async () => {
        if (!selectedInvitation) return;
        await onRevokeInvitation(selectedInvitation);
        setIsRevokeDialogOpen(false);
        setSelectedInvitation(null);
    };

    return (
        <div className="space-y-3">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search invitations by email, name, department, school year, or status..."
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="pl-9"
                />
            </div>

            <div className="flex items-center justify-end">
                <Select
                    value={(table.getColumn("status")?.getFilterValue() as string) ?? "all"}
                    onValueChange={(value) =>
                        table.getColumn("status")?.setFilterValue(value === "all" ? "all" : value)
                    }
                >
                    <SelectTrigger className="w-44">
                        <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="accepted">Accepted</SelectItem>
                        <SelectItem value="revoked">Revoked</SelectItem>
                        <SelectItem value="expired">Expired</SelectItem>
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
                                    No invitations found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                    Showing {table.getRowModel().rows.length} of {table.getFilteredRowModel().rows.length} invitations
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

            <RevokeAdviserInvitationDialog
                open={isRevokeDialogOpen}
                onOpenChange={handleRevokeDialogChange}
                invitationEmail={selectedInvitation?.email ?? null}
                isSubmitting={Boolean(selectedInvitation && revokingInvitationId === selectedInvitation.id)}
                onConfirm={handleConfirmRevokeInvitation}
            />
        </div>
    );
}
