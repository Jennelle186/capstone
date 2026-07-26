"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Inbox } from "lucide-react"

import type { FieldAnalytics } from "@/types/analytics"

const COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
]

interface PieChartRendererProps {
  data: FieldAnalytics
}

export default function PieChartRenderer({ data }: PieChartRendererProps) {
  const chartData = (data.distribution ?? []).map((d) => ({
    name: d.label,
    value: d.count,
  }))

  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
        <Inbox className="h-6 w-6" />
        <p className="text-xs">No data</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={40}
            outerRadius={70}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {data.distribution?.slice(0, 5).map((d, i) => (
          <span key={d.label} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: COLORS[i % COLORS.length] }}
            />
            {d.label} ({d.count})
          </span>
        ))}
      </div>
    </div>
  )
}
