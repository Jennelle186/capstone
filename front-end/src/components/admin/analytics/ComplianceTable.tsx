"use client"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { DocumentComplianceItem } from "@/types/analytics"

function rateBadge(rate: number) {
  if (rate >= 90) return <Badge className="bg-emerald-600">{rate.toFixed(1)}%</Badge>
  if (rate >= 70) return <Badge className="bg-amber-500">{rate.toFixed(1)}%</Badge>
  return <Badge className="bg-red-500">{rate.toFixed(1)}%</Badge>
}

interface ComplianceTableProps {
  items: DocumentComplianceItem[]
}

export default function ComplianceTable({ items }: ComplianceTableProps) {
  if (items.length === 0) return null

  return (
    <div className="max-h-[400px] overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Document</TableHead>
            <TableHead className="text-center">Verified</TableHead>
            <TableHead className="text-center">Pending</TableHead>
            <TableHead className="text-center">Missing</TableHead>
            <TableHead className="text-center">Eligible</TableHead>
            <TableHead className="text-right">Rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.document_code}>
              <TableCell className="font-medium">
                {item.document_type}
                {item.classification_scope.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({item.classification_scope.join(", ")})
                  </span>
                )}
              </TableCell>
              <TableCell className="text-center tabular-nums text-emerald-600">
                {item.verified}
              </TableCell>
              <TableCell className="text-center tabular-nums text-amber-600">
                {item.pending}
              </TableCell>
              <TableCell className="text-center tabular-nums text-red-600">
                {item.missing}
              </TableCell>
              <TableCell className="text-center tabular-nums">
                {item.eligible_students}
              </TableCell>
              <TableCell className="text-right">{rateBadge(item.verification_rate)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
