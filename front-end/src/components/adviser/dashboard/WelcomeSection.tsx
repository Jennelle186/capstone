import { motion } from "framer-motion";
import { Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import ProgramSelector from "@/components/adviser/dashboard/ProgramSelector";
import { useAdviserProgramScope } from "@/hooks/useAdviserProgramScope";
import type { AdviserProfileResponse } from "@/types/adviser";

interface WelcomeSectionProps {
  profile: AdviserProfileResponse | null;
  isLoading: boolean;
}

function buildFullName(profile: AdviserProfileResponse): string {
  return [profile.first_name, profile.middle_name, profile.last_name]
    .filter(Boolean)
    .join(" ");
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function WelcomeSection({ profile, isLoading }: WelcomeSectionProps) {
  const { hasMultiplePrograms } = useAdviserProgramScope();

  if (isLoading) {
    return (
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-36 rounded-lg" />
          <Skeleton className="h-7 w-36 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const fullName = buildFullName(profile);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col md:flex-row md:items-center md:justify-between gap-4"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {getGreeting()}, {fullName || "Adviser"}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          College of Computer Studies &mdash; Here&apos;s what&rsquo;s happening with your advisees today.
        </p>
      </div>
      <div className="flex gap-2">
        {hasMultiplePrograms ? (
          <ProgramSelector />
        ) : (
          <>
            {(profile.departments.length > 0
              ? profile.departments
              : profile.department
                ? [profile.department]
                : []
            ).map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200 shadow-sm"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {name}
              </span>
            ))}
          </>
        )}
        {profile.school_year && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200 shadow-sm">
            <Calendar className="h-3.5 w-3.5" />
            S.Y. {profile.school_year}
          </span>
        )}
      </div>
    </motion.div>
  );
}
