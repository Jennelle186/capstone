"use client"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Eye } from "lucide-react"

export type DataTableDashboard = {
    id: string
    documentType: string
    description: string
    status: string
}

const statusStyles: Record<string, string> = {
    uploaded: "bg-blue-100 text-blue-700",
    verified: "bg-green-100 text-green-700",
    accepted: "bg-emerald-100 text-emerald-700",
    rejected: "bg-rose-100 text-rose-700",
}

const statusDisplay: Record<string, string> = {
    uploaded: "Uploaded",
    verified: "Verified by Adviser",
    accepted: "Accepted",
    rejected: "Rejected",
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
        cell: ({ row }) => {
            const name = row.getValue("documentType") as string
            const description = (row.original as DataTableDashboard).description
            return (
                <div>
                    <p className="text-sm font-medium text-slate-900">{name}</p>
                    {description && (
                        <p className="text-xs text-slate-500 leading-tight mt-0.5">{description}</p>
                    )}
                </div>
            )
        },
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
            const status = (row.getValue("status") as string) || "pending"
            const style = statusStyles[status] || "bg-slate-100 text-slate-700"
            const label = statusDisplay[status] || status
            return (
                <Badge variant="secondary" className={`gap-2 rounded-full border-0 px-3 py-1 ${style}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${status === "accepted" || status === "verified" ? "bg-green-600" : status === "rejected" ? "bg-rose-600" : "bg-slate-400"}`} />
                    {label}
                </Badge>
            )
        },
    },
    {
        id: "actions",
        header: "Actions",
        enableSorting: false,
        cell: () => (
            <Button
                variant="ghost"
                size="sm"
                className="gap-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                onClick={() => {}}
            >
                <Eye className="h-4 w-4" />
                View
            </Button>
        ),
    },
]
