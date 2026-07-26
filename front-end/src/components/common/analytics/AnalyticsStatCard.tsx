import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface AnalyticsStatCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  label: string;
  value: string | number;
  delay?: number;
}

export default function AnalyticsStatCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  value,
  delay = 0,
}: AnalyticsStatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4"
    >
      <div className={`flex h-12 w-12 items-center justify-center rounded-full ${iconBg} ${iconColor} shrink-0`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </motion.div>
  );
}
