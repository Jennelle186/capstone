import { motion, type Variants } from "framer-motion";
import { Users, Clock, FileText, CheckCircle } from "lucide-react";
import type { DashboardStats } from "@/types/adviser-dashboard";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3 },
  },
};

const defaultStats: DashboardStats = {
  totalStudents: 0,
  pendingReviews: 0,
  submittedToday: 0,
  verifiedCount: 0,
  progressPercent: 0,
};

interface StatCardsProps {
  stats?: DashboardStats;
}

const cards = [
  {
    key: "totalStudents" as const,
    label: "Total Advisees",
    icon: Users,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    subtitle: "This semester",
    badge: null as null | ((v: number) => { text: string; className: string } | null),
  },
  {
    key: "pendingReviews" as const,
    label: "Pending Reviews",
    icon: Clock,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    subtitle: null,
    badge: (v: number) => v > 0
      ? { text: "Action needed", className: "bg-amber-50 text-amber-700 border border-amber-200" }
      : { text: "Idle", className: "bg-slate-100 text-slate-500" },
  },
  {
    key: "submittedToday" as const,
    label: "Submitted Today",
    icon: FileText,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    subtitle: null,
    badge: (v: number) => v > 0
      ? { text: "New files", className: "bg-emerald-50 text-emerald-700 border border-emerald-200" }
      : { text: "None yet", className: "bg-slate-100 text-slate-500" },
  },
  {
    key: "verifiedCount" as const,
    label: "Verified Docs",
    icon: CheckCircle,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    subtitle: "Verified & Completed",
    badge: null,
  },
];

export default function StatCards({ stats = defaultStats }: StatCardsProps) {
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="grid grid-cols-1 md:grid-cols-4 gap-6"
    >
      {cards.map((card) => {
        const value = stats[card.key];
        const badgeData = card.badge?.(value);

        return (
          <motion.div
            key={card.key}
            variants={itemVariants}
            className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
          >
            <div className={`absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-full ${card.iconBg}`}>
              <card.icon className={`h-6 w-6 ${card.iconColor}`} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              {card.label}
            </p>
            <p className="text-2xl font-bold text-slate-900 leading-tight mt-1">
              {value}
            </p>
            {badgeData ? (
              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold rounded-full mt-1.5 ${badgeData.className}`}>
                {badgeData.text}
              </span>
            ) : card.subtitle ? (
              <p className="text-[10px] text-slate-500 mt-1.5">{card.subtitle}</p>
            ) : null}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
