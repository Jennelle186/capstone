import { Skeleton } from "@/components/ui/skeleton";

function TermsSectionSkeleton() {
  return (
    <section className="space-y-3">
      <Skeleton className="h-7 w-72" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-11/12" />
    </section>
  );
}

export default function TermsPageSkeleton() {
  return (
    <main className="bg-white">
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-4 h-10 w-full max-w-2xl md:h-12" />
          <Skeleton className="mt-4 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-11/12" />
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-10 px-6 py-14 md:px-10 md:py-16">
        {Array.from({ length: 8 }).map((_, index) => (
          <TermsSectionSkeleton key={`terms-section-skeleton-${index}`} />
        ))}
      </div>
    </main>
  );
}
