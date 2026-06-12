import { motion } from "framer-motion";
import { Building2, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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

export default function WelcomeSection({ profile, isLoading }: WelcomeSectionProps) {
  if (isLoading) {
    return (
      <section className="space-y-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-5 w-96" />
      </section>
    );
  }

  if (!profile) return null;

  const fullName = buildFullName(profile);

  return (
    <motion.section
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <h2 className="text-3xl font-bold tracking-tight text-slate-900">
        Dashboard Overview
      </h2>
      <p className="mt-1 text-base text-slate-500">
        Welcome back,{" "}
        <span className="font-semibold text-slate-900">{fullName || "Adviser"}</span>.
        You have{" "}
        <span className="font-semibold text-emerald-600">12 pending verifications</span>{" "}
        to complete today.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {profile.department && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            <Building2 className="h-3.5 w-3.5" />
            {profile.department}
          </span>
        )}
        {profile.school_year && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Calendar className="h-3.5 w-3.5" />
            S.Y. {profile.school_year}
          </span>
        )}
      </div>
    </motion.section>
  );
}
