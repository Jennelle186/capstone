import { type JSX } from "react"

import type { FieldAnalytics } from "@/types/analytics"
import BarChartRenderer from "./BarChartRenderer"
import BooleanRenderer from "./BooleanRenderer"
import NumericRenderer from "./NumericRenderer"
import PieChartRenderer from "./PieChartRenderer"

interface AnalyticsRendererProps {
  field: FieldAnalytics
}

type Renderer = (props: { data: FieldAnalytics }) => JSX.Element

const renderers: Record<string, Renderer> = {
  select: PieChartRenderer,
  "multi-select": BarChartRenderer,
  string: BarChartRenderer,
  number: NumericRenderer,
  integer: NumericRenderer,
  boolean: BooleanRenderer,
}

export default function AnalyticsRenderer({ field }: AnalyticsRendererProps) {
  if (field.analytics_mode === "bucketized") {
    return <BarChartRenderer data={field} />
  }
  const Renderer = renderers[field.field_type] ?? NumericRenderer
  return <Renderer data={field} />
}