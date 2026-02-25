import { Skeleton } from "@/components/ui/skeleton";

function AboutSectionSkeleton() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-14 md:px-10 md:py-16">
      <Skeleton className="h-8 w-72" />
      <Skeleton className="mt-3 h-5 w-full" />
      <Skeleton className="mt-2 h-5 w-11/12" />
    </section>
  );
}

export default function AboutPageSkeleton() {
  return (
    <main className="bg-white">
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-16 md:px-10 md:py-20">
          <Skeleton className="h-3 w-44" />
          <Skeleton className="mt-4 h-10 w-full max-w-3xl md:h-12" />
          <Skeleton className="mt-4 h-5 w-full" />
          <Skeleton className="mt-2 h-5 w-11/12" />
        </div>
      </section>
      <AboutSectionSkeleton />
      <AboutSectionSkeleton />
      <AboutSectionSkeleton />
    </main>
  );
}
