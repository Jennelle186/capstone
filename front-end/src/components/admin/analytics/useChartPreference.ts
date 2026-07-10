import { useCallback, useState } from "react"
import type { ChartType } from "./chartDefaults"

const STORAGE_PREFIX = "chart_pref_"
const VALID_TYPES = new Set([
  "bar", "donut", "table", "numeric-grid", "stacked-bar", "line",
])

function isValidChartType(v: string): v is ChartType {
  return VALID_TYPES.has(v)
}

export function useChartPreference(
  canonicalKey: string,
  defaultType: ChartType,
): [ChartType, (type: ChartType) => void] {
  const [chartType, setChartType] = useState<ChartType>(() => {
    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${canonicalKey}`)
      if (saved && isValidChartType(saved)) return saved
    } catch {}
    return defaultType
  })

  const updatePreference = useCallback(
    (newType: ChartType) => {
      setChartType(newType)
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${canonicalKey}`, newType)
      } catch {}
    },
    [canonicalKey],
  )

  return [chartType, updatePreference]
}
