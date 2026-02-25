import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ProfileInputSkeleton({ wide = false }: { wide?: boolean }) {
  return (
    <div className={wide ? "space-y-2 md:col-span-2" : "space-y-2"}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );
}

function ProfileSectionSkeleton() {
  return (
    <Card className="rounded-2xl border border-slate-200 shadow-sm">
      <CardHeader>
        <Skeleton className="h-6 w-44" />
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
      </CardContent>
    </Card>
  );
}

function AcademicSectionSkeleton() {
  return (
    <Card className="rounded-2xl border border-slate-200 shadow-sm">
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
        <ProfileInputSkeleton />
        <ProfileInputSkeleton wide />
        <div className="space-y-2 md:col-span-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-20 w-full rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfileSettingsSkeleton() {
  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit rounded-2xl border border-slate-200 shadow-sm">
          <CardHeader>
            <Skeleton className="h-6 w-36" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-9 w-full rounded-md" />
            <Skeleton className="h-9 w-full rounded-md" />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <ProfileSectionSkeleton />
          <AcademicSectionSkeleton />
          <div className="flex justify-end">
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
      </div>
    </section>
  );
}
