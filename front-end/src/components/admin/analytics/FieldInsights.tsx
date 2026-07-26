import { CircleCheck, CircleX } from "lucide-react"

interface FieldInsightsProps {
  totalStudents: number
  valuesPresent: number
  valuesMissing: number
  completionRate: number
}

export default function FieldInsights({
  totalStudents,
  valuesPresent,
  valuesMissing,
  completionRate,
}: FieldInsightsProps) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <CircleCheck className="h-3.5 w-3.5 text-emerald-500" />
        {valuesPresent}/{totalStudents}
      </span>
      {valuesMissing > 0 && (
        <span className="flex items-center gap-1">
          <CircleX className="h-3.5 w-3.5 text-red-400" />
          {valuesMissing} missing
        </span>
      )}
      <span
        className={`rounded-full px-2 py-0.5 font-medium ${
          completionRate >= 90
            ? "bg-emerald-50 text-emerald-700"
            : completionRate >= 50
              ? "bg-amber-50 text-amber-700"
              : "bg-red-50 text-red-700"
        }`}
      >
        {completionRate}%
      </span>
    </div>
  )
}