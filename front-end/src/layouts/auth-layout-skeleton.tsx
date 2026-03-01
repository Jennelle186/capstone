import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

interface AuthLayoutSkeletonProps {
  children: ReactNode;
}

export default function AuthLayoutSkeleton({ children }: AuthLayoutSkeletonProps) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden overflow-hidden border-r border-slate-200 bg-slate-50 p-10 text-slate-900 lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,_rgba(148,163,184,0.08)_0%,_transparent_45%,_rgba(226,232,240,0.45)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_rgba(15,23,42,0.06),_transparent_45%)]" />

        <div className="relative space-y-4">
          <Skeleton className="h-3 w-72" />
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-11/12 max-w-md" />
        </div>

        <div className="relative mt-10 space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-4 w-11/12 max-w-md" />
          <Skeleton className="h-4 w-10/12 max-w-md" />
        </div>

        <div className="relative mt-10 flex flex-wrap gap-2">
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-32 rounded-full" />
        </div>
      </aside>

      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <div className="mb-6 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-4 w-11/12" />
            </div>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
