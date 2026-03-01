import { Skeleton } from "@/components/ui/skeleton";

export default function ForgotPasswordFormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>

      <Skeleton className="h-9 w-full rounded-md" />

      <div className="flex justify-center">
        <Skeleton className="h-4 w-36" />
      </div>
    </div>
  );
}
