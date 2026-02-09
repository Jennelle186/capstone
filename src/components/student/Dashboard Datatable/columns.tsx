"use client"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Check, Eye } from "lucide-react"


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
                className="-ml-3 h-8 text-xs uppercase tracking-wide text-muted-foreground"
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
                className="-ml-3 h-8 text-xs uppercase tracking-wide text-muted-foreground"
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
                className="-ml-3 h-8 text-xs uppercase tracking-wide text-muted-foreground"
                onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            >
                Status
                <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
            </Button>
        ),
        cell: ({ row }) => (
            <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                {row.getValue("status")}
            </Badge>
        ),
    },
    {
        accessorKey: "sentToAdmin",
        header: ({ column }) => (
            <Button
                variant="ghost"
                size="sm"
                className="-ml-3 h-8 text-xs uppercase tracking-wide text-muted-foreground"
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
            <Button variant="ghost" size="sm" className="text-emerald-700" onClick={() => console.log("clicked", row.id)}>
                <Eye className="mr-2 h-4 w-4" />
                View
            </Button>
        ),
    },
]
