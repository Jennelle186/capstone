import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Users } from "lucide-react";
import type { DepartmentClearance } from "@/hooks/useAdminDashboard";

interface DepartmentEfficiencyCardProps {
  data?: DepartmentClearance[] | null;
}

function clearanceColor(rate: number): string {
  if (rate >= 80) return "text-emerald-600";
  if (rate >= 50) return "text-amber-600";
  return "text-red-600";
}

function clearanceBg(rate: number): string {
  if (rate >= 80) return "bg-emerald-600";
  if (rate >= 50) return "bg-amber-600";
  return "bg-red-600";
}

function AdviserTooltip({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-primary transition-colors text-muted-foreground/70"
            onClick={(e) => e.preventDefault()}
          >
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs">{names.length}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-3 max-w-xs space-y-1">
          <p className="text-xs font-semibold text-muted-foreground border-b pb-1 mb-1">
            Assigned Advisers
          </p>
          {names.map((n, i) => (
            <p key={i} className="text-sm font-medium">
              {n}
            </p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function DepartmentEfficiencyCard({ data }: DepartmentEfficiencyCardProps) {
  const isMobile = useIsMobile();

  if (!data || data.length === 0) {
    return (
      <Card className="border-0 shadow-sm h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
            Department Efficiency
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No department data available.</p>
        </CardContent>
      </Card>
    );
  }

  if (isMobile) {
    return (
      <Card className="border-0 shadow-sm h-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
            Department Efficiency
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.map((dept) => (
            <div
              key={dept.department_id}
              className="rounded-lg border border-border p-3 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground text-sm">
                  {dept.department_name}
                </span>
                <AdviserTooltip names={dept.adviser_names} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Students</span>
                  <p className="font-semibold text-foreground">{dept.total_students}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Cleared</span>
                  <p className="font-semibold text-foreground">{dept.cleared_students}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Rate</span>
                  <p className={cn("font-bold", clearanceColor(dept.clearance_rate))}>
                    {dept.clearance_rate}%
                  </p>
                </div>
              </div>
              <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full", clearanceBg(dept.clearance_rate))}
                  style={{ width: `${dept.clearance_rate}%` }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
          Department Efficiency
        </CardTitle>
        <span className="text-xs text-muted-foreground/50">Advisers</span>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Department
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                Students
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                Cleared
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
                Rate
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((dept) => (
              <TableRow key={dept.department_id}>
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    {dept.department_name}
                    <AdviserTooltip names={dept.adviser_names} />
                  </div>
                </TableCell>
                <TableCell className="text-right text-foreground">
                  {dept.total_students}
                </TableCell>
                <TableCell className="text-right text-foreground">
                  {dept.cleared_students}
                </TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex items-center gap-1.5 justify-end">
                    <span className={cn("text-sm font-bold", clearanceColor(dept.clearance_rate))}>
                      {dept.clearance_rate}%
                    </span>
                    <div className="w-14 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", clearanceBg(dept.clearance_rate))}
                        style={{ width: `${dept.clearance_rate}%` }}
                      />
                    </div>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
