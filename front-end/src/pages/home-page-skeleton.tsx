import { Skeleton } from "@/components/ui/skeleton";

function FeatureCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="mt-2 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-5/6" />
    </div>
  );
}

export default function HomePageSkeleton() {
  return (
    <div className="bg-white">
      <section className="relative overflow-hidden bg-linear-to-b from-slate-50 via-white to-white">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-emerald-100/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-0 h-72 w-72 rounded-full bg-sky-100/50 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(15,23,42,0.06),transparent_45%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(148,163,184,0.12)_0%,transparent_40%,rgba(226,232,240,0.6)_100%)]" />

        <div className="mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28">
          <Skeleton className="h-3 w-72" />
          <Skeleton className="mt-4 h-10 w-full max-w-4xl md:h-14" />
          <Skeleton className="mt-5 h-5 w-full max-w-2xl" />
          <Skeleton className="mt-2 h-5 w-11/12 max-w-2xl" />

          <div className="mt-10 flex flex-wrap gap-3">
            <Skeleton className="h-10 w-28 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>

          <div className="mt-14 grid gap-6 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm md:grid-cols-3">
            <FeatureCardSkeleton />
            <FeatureCardSkeleton />
            <FeatureCardSkeleton />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <FeatureCardSkeleton key={`home-feature-skeleton-${index}`} />
          ))}
        </div>
      </section>

      <section className="bg-slate-50">
        <div className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div
                key={`home-role-skeleton-${index}`}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <Skeleton className="h-4 w-44" />
                <Skeleton className="mt-3 h-4 w-full" />
                <Skeleton className="mt-2 h-4 w-11/12" />
                <Skeleton className="mt-2 h-4 w-10/12" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="mt-3 h-5 w-full max-w-2xl" />
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <FeatureCardSkeleton key={`home-benefit-skeleton-${index}`} />
          ))}
        </div>
      </section>

      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-6 py-12 md:flex-row md:items-center md:justify-between md:px-10 md:py-14">
          <div className="w-full md:max-w-xl">
            <Skeleton className="h-7 w-full max-w-lg" />
            <Skeleton className="mt-2 h-4 w-full max-w-md" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-28 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
      </section>
    </div>
  );
}
