"use client"

import { useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import type { FieldAnalytics, SnapshotResponse } from "@/types/analytics"
import ComplianceChart from "./ComplianceChart"
import ComplianceTable from "./ComplianceTable"
import FieldCard from "./FieldCard"

interface SnapshotTabProps {
  snapshot: SnapshotResponse | null
  isLoading: boolean
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <Skeleton className="h-24 w-48 rounded-xl" />
        <Skeleton className="h-24 w-48 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

function ComplianceSection({
  items,
}: {
  items: SnapshotResponse["document_compliance"]
}) {
  const [view, setView] = useState<"chart" | "table">("chart")

  if (items.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Document Compliance
        </h3>
        <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
          <button
            type="button"
            onClick={() => setView("chart")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              view === "chart"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Chart
          </button>
          <button
            type="button"
            onClick={() => setView("table")}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              view === "table"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            Table
          </button>
        </div>
      </div>
      {view === "chart" ? <ComplianceChart items={items} /> : <ComplianceTable items={items} />}
    </div>
  )
}

export default function SnapshotTab({ snapshot, isLoading }: SnapshotTabProps) {
  if (isLoading) return <LoadingSkeleton />
  if (!snapshot) return <p className="text-sm text-muted-foreground">No data</p>

  const fieldsByGroup = snapshot.fields.reduce(
    (acc, f) => {
      const g = f.analytics_group ?? "Ungrouped"
      if (!acc[g]) acc[g] = []
      acc[g].push(f)
      return acc
    },
    {} as Record<string, FieldAnalytics[]>,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Total Students
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-900">
            {snapshot.total_students}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Verified Submissions
          </p>
          <p className="mt-1 text-3xl font-bold text-slate-900">
            {snapshot.total_verified_submissions}
          </p>
        </div>
      </div>

      <ComplianceSection items={snapshot.document_compliance} />

      {Object.entries(fieldsByGroup).map(([group, fields]) => (
        <div key={group}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500">
            {group}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((f) => (
              <FieldCard key={f.canonical_key} field={f} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}