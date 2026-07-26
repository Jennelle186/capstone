"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Inbox } from "lucide-react"

import type { FieldAnalytics } from "@/types/analytics"
import DistributionTable from "./DistributionTable"

const COLORS = [
  "#10b981", "#6366f1", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
]

const MAX_BAR_ITEMS = 10

interface BarChartRendererProps {
  data: FieldAnalytics
}

export default function BarChartRenderer({ data }: BarChartRendererProps) {
  const distribution = data.distribution ?? []
  const sorted = [...distribution].sort((a, b) => b.count - a.count)

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1 py-6 text-center text-muted-foreground">
        <Inbox className="h-6 w-6" />
        <p className="text-xs">No data</p>
      </div>
    )
  }

  if (sorted.length > MAX_BAR_ITEMS) {
    const top = sorted.slice(0, MAX_BAR_ITEMS)

    return (
      <div className="space-y-2">
        <DistributionTable distribution={top} />
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="w-full rounded-md border border-slate-200 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-slate-50"
            >
              Show all {sorted.length} items
            </button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{data.label}</DialogTitle>
            </DialogHeader>
            <DistributionTable distribution={sorted} />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const chartData = sorted.map((d) => ({
    name: d.label,
    value: d.count,
  }))

  return (
    <div className="flex flex-col items-center gap-2">
      <ResponsiveContainer
        width="100%"
        height={Math.max(120, chartData.length * 32)}
      >
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 0, right: 0, top: 4, bottom: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={90}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
