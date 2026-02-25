import * as React from "react";
import { AlertTriangle, TrendingUp, UserPlus } from "lucide-react";
import { motion } from "framer-motion";
import MetricCard from "@/components/teacher/MetricCard";
import TotalEnrolleesSection from "@/components/dashboard/total-enrollees-section";
import type { OptimizedAreaChartDataPoint } from "@/components/charts/optimized-area-chart";

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

function buildEnrolleeSeries(totalPoints: number): OptimizedAreaChartDataPoint[] {
  const start = new Date("2023-01-01T00:00:00.000Z");

  return Array.from({ length: totalPoints }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);

    const trend = 250 + index * 0.9;
    const seasonal = Math.sin(index / 12) * 42 + Math.cos(index / 7) * 18;
    const value = Math.max(80, Math.round(trend + seasonal));

    return {
      date: date.toISOString().slice(0, 10),
      value,
    };
  });
}

export default function TeacherDashboard() {
  const totalEnrolleesData = React.useMemo(() => buildEnrolleeSeries(1400), []);

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
      <motion.div variants={itemVariants} initial="hidden" animate="show">
        <TotalEnrolleesSection data={totalEnrolleesData} />
      </motion.div>
    </section>
  );
}
