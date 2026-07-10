"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DistributionOption } from "@/types/analytics"

function MiniBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-emerald-500"
        style={{ width: `${Math.min(pct, 100)}%` }}
      />
    </div>
  )
}

interface DistributionTableProps {
  distribution: DistributionOption[]
}

export default function DistributionTable({
  distribution,
}: DistributionTableProps) {
  const sorted = [...distribution].sort((a, b) => b.count - a.count)
  const maxCount = sorted[0]?.count ?? 0

  if (sorted.length === 0) return null

  return (
    <div className="max-h-[300px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label</TableHead>
            <TableHead className="text-right">Count</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((d) => (
            <TableRow key={d.label}>
              <TableCell className="max-w-[200px] truncate text-sm font-medium">
                {d.label}
              </TableCell>
              <TableCell className="text-right tabular-nums">{d.count}</TableCell>
              <TableCell className="text-right tabular-nums">
                {d.percentage.toFixed(1)}
              </TableCell>
              <TableCell>
                <MiniBar pct={(d.count / maxCount) * 100} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
