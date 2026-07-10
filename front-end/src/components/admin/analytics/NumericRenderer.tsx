"use client"

import { Inbox } from "lucide-react"
import type { FieldAnalytics } from "@/types/analytics"

interface NumericRendererProps {
  data: FieldAnalytics
}

function RangeBar({
  min,
  max,
  mean,
  median,
}: {
  min: number
  max: number
  mean: number
  median: number
}) {
  const range = max - min || 1
  const meanPos = ((mean - min) / range) * 100
  const medianPos = ((median - min) / range) * 100

  return (
    <div className="space-y-1">
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="absolute h-full rounded-full bg-emerald-100"
          style={{ left: "0%", width: "100%" }}
        />
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-emerald-600"
          style={{ left: `${meanPos}%` }}
          title={`Mean: ${mean.toFixed(2)}`}
        />
        <div
          className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 rounded-full bg-amber-500"
          style={{ left: `${medianPos}%` }}
          title={`Median: ${median.toFixed(2)}`}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="tabular-nums">{min.toFixed(1)}</span>
        <span className="flex gap-3 tabular-nums">
          <span className="text-emerald-700">M {mean.toFixed(1)}</span>
          <span className="text-amber-600">Md {median.toFixed(1)}</span>
        </span>
        <span className="tabular-nums">{max.toFixed(1)}</span>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
}: {
  label: string
  value: string | number | null | undefined
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">
        {value !== null && value !== undefined ? value : "—"}
      </p>
    </div>
  )
}

export default function NumericRenderer({ data }: NumericRendererProps) {
  if (!data.count || data.count === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
        <Inbox className="h-6 w-6" />
        <p className="text-xs">No data</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {data.min != null && data.max != null && data.mean != null && (
        <RangeBar
          min={data.min}
          max={data.max}
          mean={data.mean}
          median={data.median ?? data.mean}
        />
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatCard label="Count" value={data.count} />
        <StatCard label="Mean" value={data.mean?.toFixed(2)} />
        <StatCard label="Median" value={data.median?.toFixed(2)} />
        <StatCard label="Min" value={data.min} />
        <StatCard label="Max" value={data.max} />
        <StatCard label="Std Dev" value={data.std?.toFixed(2)} />
      </div>
    </div>
  )
}
