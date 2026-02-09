"use client"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Eye } from "lucide-react"


// This type is used to define the shape of our data.
// You can use a Zod schema here if you want.
export type DataTableDashboard = {
    id: string
    documentType: string
    uploaded: boolean
    status: "pending" | "verified" | "rejected"
    sentToAdmin: boolean
}

export const columns: ColumnDef<DataTableDashboard>[] = [
    {
        accessorKey: "documentType",
        header: ({ column }) => (
            <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Document Type
                <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
            </Button>
        ),
    },
    {
        accessorKey: "uploaded",
        header: ({ column }) => (
            <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Uploaded?
                <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
            </Button>
        ),
        cell: ({ row }) => (row.getValue("uploaded") ? "Yes" : "No"),
    },
    {
        accessorKey: "status",
        header: ({ column }) => (
            <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Status
                <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
            </Button>
        ),
        cell: ({ row }) => {
            const status = row.getValue("status") as string
            const statusStyles =
                status === "verified"
                    ? "bg-green-100 text-green-700"
                    : status === "pending"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-rose-100 text-rose-700"
            return (
                <Badge variant="secondary" className={`gap-2 rounded-full border-0 px-3 py-1 ${statusStyles}`}>
                    {status === "verified" && <span className="h-1.5 w-1.5 rounded-full bg-green-600" />}
                    {status}
                </Badge>
            )
        },
    },
    {
        accessorKey: "sentToAdmin",
        header: ({ column }) => (
            <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Sent to Admin
                <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
            </Button>
        ),
        cell: ({ row }) => (row.getValue("sentToAdmin") ? "Yes" : "No"),
    },
    {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: ({ row }) => (
            <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => console.log("clicked", row.id)}
            >
                <Eye className="h-4 w-4" />
                View
            </Button>
        ),
    },
]
