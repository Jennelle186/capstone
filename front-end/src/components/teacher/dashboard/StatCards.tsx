import { motion, type Variants } from "framer-motion";
import { Clock, Users, AlertTriangle } from "lucide-react";
import type { DashboardStats } from "@/types/teacher-dashboard";

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
  pendingVerifications: 24,
  newToday: 4,
  totalStudents: 1402,
  activeLabel: "Active",
  actionRequired: 8,
  priorityLabel: "High Priority",
};

interface StatCardsProps {
  stats?: DashboardStats;
}

export default function StatCards({ stats = defaultStats }: StatCardsProps) {
  const cards = [
    {
      label: "Pending Verifications",
      value: stats.pendingVerifications,
      badge: `+${stats.newToday} today`,
      badgeClass: "text-emerald-700 bg-emerald-100",
      icon: Clock,
      iconBg: "bg-emerald-100",
      valueClass: "text-emerald-600",
    },
    {
      label: "Total Students",
      value: stats.totalStudents,
      badge: stats.activeLabel,
      badgeClass: "text-slate-500 bg-slate-100",
      icon: Users,
      iconBg: "bg-blue-100",
      valueClass: "text-slate-900",
    },
    {
      label: "Action Required",
      value: String(stats.actionRequired).padStart(2, "0"),
      badge: stats.priorityLabel,
      badgeClass: "text-red-700 bg-red-100",
      icon: AlertTriangle,
      iconBg: "bg-red-100",
      valueClass: "text-red-600",
    },
  ];

  return (
    <motion.section
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3"
    >
      {cards.map((card) => (
        <motion.div
          key={card.label}
          variants={itemVariants}
          className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
        >
          <div className={`absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-xl ${card.iconBg}`}>
            <card.icon className={`h-6 w-6 ${card.valueClass}`} />
          </div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {card.label}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <h3 className={`text-4xl font-bold tracking-tight ${card.valueClass}`}>
              {card.value}
            </h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${card.badgeClass}`}>
              {card.badge}
            </span>
          </div>
        </motion.div>
      ))}
    </motion.section>
  );
}
