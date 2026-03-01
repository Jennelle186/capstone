import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardStatCardSkeleton() {
  return (
    <Card className="h-full rounded-2xl border border-slate-200 shadow-sm">
      <CardContent className="flex h-full flex-col justify-between p-6">
        <div className="flex items-start justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </div>
        <Skeleton className="h-9 w-20" />
      </CardContent>
    </Card>
  );
}
