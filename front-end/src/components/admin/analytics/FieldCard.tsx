"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { FieldAnalytics } from "@/types/analytics"
import type { ChartType } from "./chartDefaults"
import {
  CHART_LABELS,
  getAvailableChartTypes,
  inferChartType,
} from "./chartDefaults"
import { useChartPreference } from "./useChartPreference"
import AnalyticsRenderer from "./AnalyticsRenderer"
import BarChartRenderer from "./BarChartRenderer"
import DistributionTable from "./DistributionTable"
import FieldInsights from "./FieldInsights"
import PieChartRenderer from "./PieChartRenderer"

interface FieldCardProps {
  field: FieldAnalytics
}

function SnapshotChartSwitcher({
  field,
  chartType,
}: {
  field: FieldAnalytics
  chartType: ChartType
}) {
  if (field.field_type === "boolean" || chartType === "numeric-grid") {
    return <AnalyticsRenderer field={field} />
  }
  switch (chartType) {
    case "donut":
      return <PieChartRenderer data={field} />
    case "table":
      return <DistributionTable distribution={field.distribution ?? []} />
    case "bar":
      return <BarChartRenderer data={field} />
    default:
      return <AnalyticsRenderer field={field} />
  }
}

export default function FieldCard({ field }: FieldCardProps) {
  const distLen = field.distribution?.length ?? 0
  const defaultType = inferChartType(field.field_type, distLen)
  const [chartType, setChartType] = useChartPreference(
    field.canonical_key,
    defaultType,
  )
  const availableTypes = getAvailableChartTypes(field.field_type)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-900">
            {field.label}
          </h4>
          <FieldInsights
            totalStudents={field.insights.total_students}
            valuesPresent={field.insights.values_present}
            valuesMissing={field.insights.values_missing}
            completionRate={field.insights.completion_rate}
          />
        </div>
        <Select
          value={chartType}
          onValueChange={(v) => setChartType(v as ChartType)}
        >
          <SelectTrigger className="h-7 w-[120px] shrink-0 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {availableTypes.map((t) => (
              <SelectItem key={t} value={t} className="text-xs">
                {CHART_LABELS[t]}
                {t === defaultType && " (Auto)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SnapshotChartSwitcher field={field} chartType={chartType} />
    </div>
  )
}
