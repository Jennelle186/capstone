"use client"

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts"
import { Inbox } from "lucide-react"

import type { FieldAnalytics } from "@/types/analytics"

interface BooleanRendererProps {
  data: FieldAnalytics
}

export default function BooleanRenderer({ data }: BooleanRendererProps) {
  const t = data.true
  const f = data.false
  const total = (t?.count ?? 0) + (f?.count ?? 0)

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
        <Inbox className="h-6 w-6" />
        <p className="text-xs">No data</p>
      </div>
    )
  }

  const chartData = [
    { name: "True", value: t?.count ?? 0, color: "#10b981" },
    { name: "False", value: f?.count ?? 0, color: "#ef4444" },
  ]

  return (
    <div className="flex flex-col items-center gap-3">
      <ResponsiveContainer width="100%" height={150}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={65}
            dataKey="value"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>

      <div className="flex w-full gap-2">
        <div className="flex flex-1 items-center justify-between rounded-lg bg-emerald-50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-800">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
            True
          </span>
          <span className="text-xs font-semibold text-emerald-900">
            {t?.count ?? 0} ({t?.percentage?.toFixed(1) ?? "—"}%)
          </span>
        </div>
        <div className="flex flex-1 items-center justify-between rounded-lg bg-red-50 px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-red-800">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            False
          </span>
          <span className="text-xs font-semibold text-red-900">
            {f?.count ?? 0} ({f?.percentage?.toFixed(1) ?? "—"}%)
          </span>
        </div>
      </div>
    </div>
  )
}
