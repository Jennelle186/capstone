"use client"

import { Skeleton } from "@/components/ui/skeleton"
import type { FieldAnalytics, SnapshotResponse } from "@/types/analytics"
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