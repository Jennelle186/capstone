import { AlertTriangle, TrendingUp, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import MetricCard from "@/components/teacher/MetricCard";

const metrics = [
  {
    title: "Total Enrollees",
    value: "1,265",
    indicatorText: "+8.4% from last month",
    indicatorIcon: TrendingUp,
    tone: "neutral" as const,
  },
  {
    title: "Pending Reviews",
    value: "48",
    indicatorText: "Needs review this week",
    indicatorIcon: AlertTriangle,
    tone: "attention" as const,
  },
  {
    title: "New Enrollees (This Week)",
    value: "93",
    indicatorText: "+14.2% this week",
    indicatorIcon: UserPlus,
    tone: "positive" as const,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.08,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: "easeOut" as const },
  },
};

export default function TeacherDashboard() {
  return (
    <section aria-label="Teacher dashboard content area" className="space-y-4">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3"
      >
        {metrics.map((metric) => (
          <motion.div key={metric.title} variants={itemVariants}>
            <MetricCard
              title={metric.title}
              value={metric.value}
              indicatorText={metric.indicatorText}
              indicatorIcon={metric.indicatorIcon}
              tone={metric.tone}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
