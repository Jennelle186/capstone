import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function UploadItemSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="min-w-0 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:justify-end">
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-9 rounded-full" />
          <Skeleton className="h-4 w-8" />
        </div>
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
    </div>
  );
}

export default function UploadZoneSkeleton() {
  return (
    <Card className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-10">
          <div className="flex flex-col items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <Skeleton className="h-4 w-52" />
          </div>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <UploadItemSkeleton key={`upload-item-skeleton-${index}`} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
