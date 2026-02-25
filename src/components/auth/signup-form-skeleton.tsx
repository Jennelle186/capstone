import { Skeleton } from "@/components/ui/skeleton";

function InputFieldSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-9 w-full rounded-md" />
    </div>
  );
}

export default function SignupFormSkeleton() {
  return (
    <div className="space-y-4">
      <InputFieldSkeleton />
      <InputFieldSkeleton />
      <InputFieldSkeleton />

      <div className="flex items-start gap-3">
        <Skeleton className="mt-1 h-4 w-4 rounded-sm" />
        <div className="w-full space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-full" />
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
