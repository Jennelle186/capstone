import { Skeleton } from "@/components/ui/skeleton";

export default function LoginFormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-9 w-full rounded-md" />
        <div className="flex justify-end">
          <Skeleton className="h-4 w-28" />
        </div>
      </div>

      <Skeleton className="h-9 w-full rounded-md" />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Skeleton className="h-px w-full rounded-none" />
        </div>
        <div className="relative flex justify-center">
          <Skeleton className="h-4 w-28 bg-background" />
        </div>
      </div>

      <Skeleton className="h-9 w-full rounded-md" />

      <div className="flex justify-center">
        <Skeleton className="h-4 w-44" />
      </div>
    </div>
  );
}
