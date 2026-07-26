"use client"

import { useMemo } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"
import type { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import DataTable from "@/components/common/data-table/DataTable"
import type { CanonicalKeyItem } from "@/types/analytics"

const TYPE_LABELS: Record<string, string> = {
  select: "Select",
  "multi-select": "Multi Select",
  number: "Number",
  integer: "Integer",
  boolean: "Boolean",
  string: "Text",
}

interface FieldsTabProps {
  keys: CanonicalKeyItem[]
  isLoading: boolean
}

function SortHeader({
  column,
  label,
}: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc: boolean) => void }
  label: string
}) {
  const sorted = column.getIsSorted()
  return (
    <Button
      variant="ghost"
      size="xs"
      className="-ml-3 h-7 gap-1 px-2 text-xs font-semibold uppercase tracking-wider"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="h-3 w-3" />
      ) : sorted === "desc" ? (
        <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </Button>
  )
}

const columns: ColumnDef<CanonicalKeyItem>[] = [
  {
    accessorKey: "canonical_key",
    header: ({ column }) => <SortHeader column={column} label="Canonical Key" />,
    cell: ({ row }) => (
      <span className="font-mono text-xs text-slate-600">{row.getValue("canonical_key")}</span>
    ),
    enableSorting: true,
  },
  {
    accessorKey: "label",
    header: ({ column }) => <SortHeader column={column} label="Label" />,
    cell: ({ row }) => <span className="font-medium">{row.getValue("label")}</span>,
    enableSorting: true,
  },
  {
    accessorKey: "field_type",
    header: ({ column }) => <SortHeader column={column} label="Type" />,
    cell: ({ row }) => {
      const raw = row.getValue("field_type") as string
      return <span className="text-xs text-muted-foreground">{TYPE_LABELS[raw] ?? raw}</span>
    },
    enableSorting: true,
    filterFn: "equalsString",
  },
  {
    accessorKey: "analytics_group",
    header: ({ column }) => <SortHeader column={column} label="Group" />,
    cell: ({ row }) => {
      const val = row.getValue("analytics_group") as string | null
      return val ? (
        <Badge variant="outline" className="text-xs">
          {val}
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">&mdash;</span>
      )
    },
    enableSorting: true,
    filterFn: "equalsString",
  },
  {
    accessorKey: "document_types",
    header: "Documents",
    cell: ({ row }) => {
      const docs = row.getValue("document_types") as string[]
      return docs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {docs.map((dt) => (
            <Badge key={dt} variant="secondary" className="text-xs">
              {dt}
            </Badge>
          ))}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">&mdash;</span>
      )
    },
    enableSorting: false,
  },
  {
    accessorKey: "school_year_count",
    header: ({ column }) => <SortHeader column={column} label="School Years" />,
    cell: ({ row }) => (
      <span className="tabular-nums">{row.getValue("school_year_count")}</span>
    ),
    enableSorting: true,
  },
]

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-8 w-full rounded-lg" />
      <Skeleton className="h-8 w-full rounded-lg" />
      <Skeleton className="h-8 w-full rounded-lg" />
    </div>
  )
}

export default function FieldsTab({ keys, isLoading }: FieldsTabProps) {
  const groupOptions = useMemo(() => {
    const groups = new Set<string>()
    for (const k of keys) {
      if (k.analytics_group) groups.add(k.analytics_group)
    }
    return Array.from(groups)
      .sort()
      .map((g) => ({ label: g, value: g }))
  }, [keys])

  if (isLoading) return <LoadingSkeleton />
  if (keys.length === 0)
    return <p className="text-sm text-muted-foreground">No analytics fields found.</p>

  return (
    <DataTable
      data={keys}
      columns={columns}
      searchColumn="label"
      searchPlaceholder="Search by label..."
      filterColumn="analytics_group"
      filterOptions={[{ label: "All Groups", value: "all" }, ...groupOptions]}
      mobileCard={(row) => (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-1 flex items-start justify-between">
            <span className="font-medium">{row.label}</span>
            <Badge variant="outline" className="text-xs">
              {row.analytics_group ?? "Ungrouped"}
            </Badge>
          </div>
          <p className="font-mono text-xs text-slate-500">{row.canonical_key}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{TYPE_LABELS[row.field_type] ?? row.field_type}</span>
            <span>&middot;</span>
            <span>{row.school_year_count} year{row.school_year_count === 1 ? "" : "s"}</span>
          </div>
          {row.document_types.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {row.document_types.map((dt) => (
                <Badge key={dt} variant="secondary" className="text-xs">
                  {dt}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    />
  )
}
