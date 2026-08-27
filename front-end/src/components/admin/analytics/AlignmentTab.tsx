"use client"

import { useMemo, useState } from "react"
import { BarChart3, ChevronDown, ChevronRight, Search } from "lucide-react"

import AdminEmptyState from "@/components/admin/AdminEmptyState"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { AlignmentGroup, AlignmentReport } from "@/types/analytics"

interface AlignmentTabProps {
  report: AlignmentReport | null
  isLoading: boolean
}

type Status = AlignmentGroup["status"]

const STATUS_CONFIG: Record<
  Status,
  { label: string; bar: string; dot: string; accent: string; badge: string }
> = {
  aligned: {
    label: "Aligned",
    bar: "bg-emerald-500",
    dot: "bg-emerald-500",
    accent: "border-l-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
  },
  diverges: {
    label: "Diverges",
    bar: "bg-amber-500",
    dot: "bg-amber-500",
    accent: "border-l-amber-400",
    badge: "bg-amber-50 text-amber-700",
  },
  isolated: {
    label: "Isolated",
    bar: "bg-slate-300",
    dot: "bg-slate-400",
    accent: "border-l-slate-300",
    badge: "bg-slate-100 text-slate-600",
  },
}

const SECTION_ORDER: Status[] = ["diverges", "aligned", "isolated"]

function uniqueLabels(group: AlignmentGroup): string[] {
  return Array.from(new Set(group.field_details.map((d) => d.field_label)))
}

function uniqueTypes(group: AlignmentGroup): string[] {
  return Array.from(new Set(group.field_details.map((d) => d.field_type)))
}

function YearTags({ years }: { years: string[] }) {
  if (years.length === 0) {
    return <span className="text-xs text-muted-foreground">&mdash;</span>
  }

  if (years.length <= 4) {
    return (
      <div className="flex flex-wrap gap-1">
        {years.map((year) => (
          <span
            key={year}
            className="rounded-md border border-slate-200 px-2 py-0.5 text-xs text-muted-foreground"
          >
            {year}
          </span>
        ))}
      </div>
    )
  }

  return (
    <span className="text-xs text-muted-foreground">
      {years[0]} &rarr; {years[years.length - 1]}
      <span className="text-slate-400"> &middot; {years.length} years</span>
    </span>
  )
}

function LabelChips({ labels }: { labels: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {labels.map((label) => (
        <span
          key={label}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
        >
          {label}
        </span>
      ))}
    </div>
  )
}

function TypeBadge({ types }: { types: string[] }) {
  return (
    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
      {types.join(" \u00b7 ")}
    </span>
  )
}

function GroupEntry({ group }: { group: AlignmentGroup }) {
  const labels = uniqueLabels(group)
  const types = uniqueTypes(group)
  const config = STATUS_CONFIG[group.status]

  return (
    <div>
      <div className="hidden items-center gap-3 py-3 md:flex">
        <span className="w-40 shrink-0 truncate font-mono text-sm font-medium text-slate-800">
          {group.canonical_key}
        </span>
        <div className="min-w-0 flex-1">
          <LabelChips labels={labels} />
        </div>
        <TypeBadge types={types} />
        <div className="shrink-0">
          <YearTags years={group.school_year_names} />
        </div>
      </div>

      {group.divergences.length > 0 && (
        <p className="hidden pb-3 text-xs text-amber-700 md:-mt-2 md:block">
          {group.divergences.join(" \u00b7 ")}
        </p>
      )}

      <div
        className={cn(
          "mb-2 rounded-xl border border-slate-200 border-l-4 bg-white p-4 md:hidden",
          config.accent,
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="font-mono text-sm font-medium text-slate-800">
            {group.canonical_key}
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
              config.badge,
            )}
          >
            {config.label}
          </span>
        </div>

        <div className="mt-2">
          <LabelChips labels={labels} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <YearTags years={group.school_year_names} />
          <TypeBadge types={types} />
        </div>

        {group.divergences.length > 0 && (
          <p className="mt-2 text-xs text-amber-700">{group.divergences.join(" \u00b7 ")}</p>
        )}
      </div>
    </div>
  )
}

function Section({ status, groups }: { status: Status; groups: AlignmentGroup[] }) {
  const [open, setOpen] = useState(true)
  const config = STATUS_CONFIG[status]

  if (groups.length === 0) return null

  return (
    <section className="border-b border-slate-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-3 text-left"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {config.label}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-500">
          {groups.length}
        </span>
        {status === "diverges" && (
          <span className="text-[10px] font-medium uppercase tracking-wider text-amber-600">
            needs review
          </span>
        )}
      </button>

      {open && (
        <div className="pb-2">
          {groups.map((group) => (
            <GroupEntry key={group.canonical_key} group={group} />
          ))}
        </div>
      )}
    </section>
  )
}

function HealthBar({ groups }: { groups: AlignmentGroup[] }) {
  const aligned = groups.filter((g) => g.status === "aligned").length
  const diverged = groups.filter((g) => g.status === "diverges").length
  const isolated = groups.filter((g) => g.status === "isolated").length
  const total = groups.length
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100))

  const segments = [
    { label: "Aligned", count: aligned, bar: "bg-emerald-500", dot: "bg-emerald-500" },
    { label: "Diverges", count: diverged, bar: "bg-amber-500", dot: "bg-amber-500" },
    { label: "Isolated", count: isolated, bar: "bg-slate-300", dot: "bg-slate-400" },
  ]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
        {segments
          .filter((s) => s.count > 0)
          .map((s) => (
            <div
              key={s.label}
              className={cn("h-full", s.bar)}
              style={{ width: `${pct(s.count)}%` }}
            />
          ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", s.dot)} />
            <span
              className={cn(
                "text-2xl font-bold tabular-nums",
                s.label === "Diverges" && s.count > 0 ? "text-amber-700" : "text-slate-900",
              )}
            >
              {s.count}
            </span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <Skeleton className="h-3 w-full rounded-full" />
        <div className="mt-3 flex gap-6">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-24" />
        </div>
      </div>
      <Skeleton className="h-9 w-full rounded-lg" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
        <Skeleton className="h-8 w-full rounded-lg" />
      </div>
    </div>
  )
}

export default function AlignmentTab({ report, isLoading }: AlignmentTabProps) {
  const [query, setQuery] = useState("")

  const groups = useMemo(() => {
    if (!report) return []
    const q = query.trim().toLowerCase()
    if (!q) return report.groups
    return report.groups.filter(
      (g) =>
        g.canonical_key.toLowerCase().includes(q) ||
        g.field_details.some((d) => d.field_label.toLowerCase().includes(q)),
    )
  }, [report, query])

  if (isLoading) return <LoadingSkeleton />

  if (!report || report.total_keys === 0) {
    return (
      <AdminEmptyState
        icon={<BarChart3 className="h-8 w-8 text-slate-400" />}
        title="No analytics fields configured"
        description="Enable analytics on extraction schema fields to see how they align across school years."
      />
    )
  }

  const byStatus = (status: Status) => groups.filter((g) => g.status === status)

  return (
    <div className="space-y-4">
      <HealthBar groups={groups} />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by field name or label..."
          className="h-9 max-w-xs pl-9"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white px-4">
        {SECTION_ORDER.map((status) => (
          <Section key={status} status={status} groups={byStatus(status)} />
        ))}

        {groups.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No fields match &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  )
}
