export type ChartType = "bar" | "donut" | "table" | "numeric-grid" | "stacked-bar" | "line"

export const CHART_LABELS: Record<ChartType, string> = {
  bar: "Bar Chart",
  donut: "Donut Chart",
  table: "Data Table",
  "numeric-grid": "Summary Grid",
  "stacked-bar": "Stacked Bar",
  line: "Line Chart",
}

export const CHART_ICONS: Record<ChartType, string> = {
  bar: "📊",
  donut: "🍩",
  table: "📋",
  "numeric-grid": "🔢",
  "stacked-bar": "📊",
  line: "📈",
}

export function inferChartType(
  fieldType: string,
  distributionLength: number,
): ChartType {
  if (fieldType === "number" || fieldType === "integer") return "numeric-grid"
  if (fieldType === "boolean") return "donut"
  if (distributionLength > 10) return "table"
  if (distributionLength <= 5 && fieldType === "select") return "donut"
  return "bar"
}

export function inferTrendChartType(
  analyticsMode: string,
  series: (Record<string, unknown> | null)[],
): ChartType {
  if (analyticsMode === "numeric_summary") return "line"

  const allLabels = new Set<string>()
  for (const s of series) {
    if (!s) continue
    const dist = s.distribution as { label: string }[] | undefined
    if (!dist) continue
    for (const d of dist) allLabels.add(d.label)
  }

  if (allLabels.size > 10) return "table"
  return "stacked-bar"
}

export function getAvailableChartTypes(fieldType: string): ChartType[] {
  switch (fieldType) {
    case "select":
      return ["donut", "bar", "table"]
    case "multi-select":
    case "string":
      return ["bar", "table", "donut"]
    case "boolean":
      return ["donut"]
    default:
      return ["numeric-grid"]
  }
}

export function getAvailableTrendChartTypes(
  analyticsMode: string,
): ChartType[] {
  if (analyticsMode === "numeric_summary") return ["line"]
  return ["stacked-bar", "table"]
}
