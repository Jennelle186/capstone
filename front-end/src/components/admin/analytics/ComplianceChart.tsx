"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { DocumentComplianceItem } from "@/types/analytics"

const COLORS = { verified: "#059669", pending: "#d97706", missing: "#dc2626" }

interface ComplianceChartProps {
  items: DocumentComplianceItem[]
}

export default function ComplianceChart({ items }: ComplianceChartProps) {
  if (items.length === 0) return null

  const data = items.map((item) => ({
    name: item.document_type,
    Verified: item.verified,
    Pending: item.pending,
    Missing: item.missing,
    rate: item.verification_rate,
  }))

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} barGap={2} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 13 }} />
        <Tooltip
          formatter={(value: number, name: string) => [value, name]}
          labelFormatter={(label: string) => label}
        />
        <Legend />
        <Bar dataKey="Verified" stackId="a" fill={COLORS.verified} radius={[2, 0, 0, 2]}>
          {data.map((_, i) => (
            <Cell key={`v-${i}`} fill={COLORS.verified} />
          ))}
        </Bar>
        <Bar dataKey="Pending" stackId="a" fill={COLORS.pending}>
          {data.map((_, i) => (
            <Cell key={`p-${i}`} fill={COLORS.pending} />
          ))}
        </Bar>
        <Bar dataKey="Missing" stackId="a" fill={COLORS.missing} radius={[0, 2, 2, 0]}>
          {data.map((_, i) => (
            <Cell key={`m-${i}`} fill={COLORS.missing} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
