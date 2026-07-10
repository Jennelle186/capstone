"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import type { ChartType } from "./chartDefaults"
import {
  CHART_LABELS,
  getAvailableTrendChartTypes,
  inferTrendChartType,
} from "./chartDefaults"
import { useChartPreference } from "./useChartPreference"
import type {
  EnrolmentSeriesItem,
  TrendResponse,
} from "@/types/analytics"

interface TrendsTabProps {
  trendFromYear: string
  setTrendFromYear: (v: string) => void
  trendToYear: string
  setTrendToYear: (v: string) => void
  selectedTrendKeys: string[]
  setSelectedTrendKeys: (keys: string[]) => void
  trendKeyOptions: { value: string; label: string }[]
  enrolment: EnrolmentSeriesItem[]
  isLoadingEnrolment: boolean
  trends: TrendResponse | null
  isLoadingTrends: boolean
}

function EnrolmentChart({
  data,
  isLoading,
}: {
  data: EnrolmentSeriesItem[]
  isLoading: boolean
}) {
  if (isLoading) return <Skeleton className="h-56 w-full rounded-xl" />
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No data</p>

  const chartData = data.map((s) => ({
    year: s.school_year_name,
    Enrolled: s.total_enrolled,
    Verified: s.verified_students,
  }))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="mb-3 text-sm font-semibold text-slate-900">Enrolment Growth</h4>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="Enrolled"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="Verified"
            stroke="#6366f1"
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function TrendsDistributionTable({
  series,
}: {
  series: (Record<string, unknown> | null)[]
}) {
  const allLabels = new Set<string>()
  const years: string[] = []

  for (const s of series) {
    if (!s) continue
    years.push(s.school_year_name as string)
    const dist = s.distribution as { label: string; count: number }[] | undefined
    if (!dist) continue
    for (const d of dist) allLabels.add(d.label)
  }

  const sortedLabels = Array.from(allLabels).sort()

  const valueMap = new Map<string, Map<string, number>>()
  for (const label of sortedLabels) {
    valueMap.set(label, new Map())
  }
  for (const s of series) {
    if (!s) continue
    const year = s.school_year_name as string
    const dist = s.distribution as { label: string; count: number }[] | undefined
    if (!dist) continue
    for (const d of dist) {
      const row = valueMap.get(d.label)
      if (row) row.set(year, d.count)
    }
  }

  return (
    <div className="max-h-[320px] overflow-y-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-white">Label</TableHead>
            {years.map((y) => (
              <TableHead key={y} className="text-right">{y}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedLabels.map((label) => {
            const row = valueMap.get(label)!
            return (
              <TableRow key={label}>
                <TableCell className="sticky left-0 max-w-[180px] truncate bg-white font-medium">
                  {label}
                </TableCell>
                {years.map((y) => {
                  const count = row.get(y) ?? 0
                  return (
                    <TableCell key={y} className="text-right tabular-nums">
                      {count}
                    </TableCell>
                  )
                })}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function TrendSeriesChart({
  label,
  canonicalKey,
  analyticsMode,
  series,
}: {
  label: string
  canonicalKey: string
  analyticsMode: string
  series: (Record<string, unknown> | null)[]
}) {
  const defaultType = inferTrendChartType(analyticsMode, series)
  const [chartType, setChartType] = useChartPreference(canonicalKey, defaultType)
  const availableTypes = getAvailableTrendChartTypes(analyticsMode)

  const select = (
    <Select value={chartType} onValueChange={(v) => setChartType(v as ChartType)}>
      <SelectTrigger className="h-7 w-[130px] text-[11px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {availableTypes.map((t) => (
          <SelectItem key={t} value={t} className="text-xs">
            {CHART_LABELS[t]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  if (analyticsMode === "numeric_summary") {
    const chartData = series
      .map((s, i) => {
        const mean = (s?.mean as number) ?? null
        return {
          year: (s?.school_year_name as string) ?? `Year ${i + 1}`,
          Mean: mean,
        }
      })
      .filter((d) => d.Mean !== null)

    if (chartData.length === 0) return null

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">{label}</h4>
          {select}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="Mean"
              stroke="#10b981"
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    )
  }

  if (analyticsMode === "distribution") {
    const chartData = series
      .map((s) => {
        if (!s) return null
        const dist = s.distribution as
          | { label: string; count: number }[]
          | undefined
        if (!dist) return null
        const entry: Record<string, string | number> = {
          year: s.school_year_name as string,
        }
        for (const d of dist) {
          entry[d.label] = d.count
        }
        return entry
      })
      .filter(Boolean)

    if (chartData.length === 0) return null

    const allLabels = new Set<string>()
    for (const d of chartData) {
      if (d)
        Object.keys(d).forEach((k) => {
          if (k !== "year") allLabels.add(k)
        })
    }
    const sortedLabels = Array.from(allLabels).sort()
    const colors = [
      "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
      "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
      "#475569", "#94a3b8",
    ]

    if (chartType === "table") {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">{label}</h4>
            {select}
          </div>
          <TrendsDistributionTable series={series} />
        </div>
      )
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-900">{label}</h4>
          {select}
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            {sortedLabels.map((lbl, i) => (
              <Bar
                key={lbl}
                dataKey={lbl}
                stackId="a"
                fill={colors[i % colors.length]}
                radius={[2, 2, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }

  return null
}

export default function TrendsTab({
  trendFromYear,
  setTrendFromYear,
  trendToYear,
  setTrendToYear,
  selectedTrendKeys,
  setSelectedTrendKeys,
  trendKeyOptions,
  enrolment,
  isLoadingEnrolment,
  trends,
  isLoadingTrends,
}: TrendsTabProps) {
  const toggleKey = (key: string) => {
    setSelectedTrendKeys(
      selectedTrendKeys.includes(key)
        ? selectedTrendKeys.filter((k) => k !== key)
        : [...selectedTrendKeys, key],
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            From Year
          </label>
          <select
            value={trendFromYear}
            onChange={(e) => setTrendFromYear(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {["2023", "2024", "2025", "2026", "2027"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            To Year
          </label>
          <select
            value={trendToYear}
            onChange={(e) => setTrendToYear(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            {["2023", "2024", "2025", "2026", "2027"].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-2 block text-xs font-medium text-muted-foreground">
          Available Fields
        </label>
        <div className="flex flex-wrap gap-3">
          {trendKeyOptions.map((opt) => (
            <label
              key={opt.value}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedTrendKeys.includes(opt.value)}
                onChange={() => toggleKey(opt.value)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              {opt.label}
            </label>
          ))}
        </div>
      </div>

      <EnrolmentChart data={enrolment} isLoading={isLoadingEnrolment} />

      {isLoadingTrends && (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      )}

      {trends &&
        Object.entries(trends.canonical_keys).map(([ck, info]) => (
          <TrendSeriesChart
            key={ck}
            canonicalKey={ck}
            label={info.label}
            analyticsMode={info.analytics_mode}
            series={info.series}
          />
        ))}
    </div>
  )
}
