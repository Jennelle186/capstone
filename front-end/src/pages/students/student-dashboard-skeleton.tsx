import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import DashboardStatCardSkeleton from "./dashboard-stat-card-skeleton";
import DashboardTableRowSkeleton from "./dashboard-table-row-skeleton";

export default function StudentDashboardSkeleton() {
  return (
    <main className="flex min-h-screen flex-1 flex-col gap-6 bg-slate-50 p-6 md:p-8">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <DashboardStatCardSkeleton key={`dashboard-stat-skeleton-${index}`} />
        ))}
      </div>

      <Card className="rounded-2xl border border-slate-200 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-slate-700">
              <thead>
                <tr className="bg-slate-50">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <th key={`dashboard-head-skeleton-${index}`} className="px-6 py-4 text-left">
                      <Skeleton className="h-3 w-24" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {Array.from({ length: 6 }).map((_, index) => (
                  <DashboardTableRowSkeleton key={`dashboard-row-skeleton-${index}`} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
