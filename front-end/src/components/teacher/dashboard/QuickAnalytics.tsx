import { motion } from "framer-motion";
import { FileText, History, ChevronRight } from "lucide-react";
import type { QuickAnalyticsData } from "@/types/teacher-dashboard";

const defaultData: QuickAnalyticsData = {
  reviewProgress: 78,
  weeklyReport: {
    label: "Weekly Report",
    timestamp: "Generated 10m ago",
  },
  activityLog: {
    label: "Activity Log",
    description: "View global edits",
  },
};

interface QuickAnalyticsProps {
  data?: QuickAnalyticsData;
}

export default function QuickAnalytics({
  data = defaultData,
}: QuickAnalyticsProps) {
  return (
    <motion.section
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="flex flex-col gap-4"
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">
          Quick Analytics
        </h4>
        <div className="mt-5 space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Review Progress
              </span>
              <span className="text-xs font-semibold text-slate-700">
                {data.reviewProgress}%
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <motion.div
                className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${data.reviewProgress}%` }}
                transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>

          <motion.div
            className="flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-colors hover:bg-slate-50"
            whileHover={{ x: 4 }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <FileText className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{data.weeklyReport.label}</p>
              <p className="text-xs text-slate-400">
                {data.weeklyReport.timestamp}
              </p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
          </motion.div>

          <motion.div
            className="flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-colors hover:bg-slate-50"
            whileHover={{ x: 4 }}
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <History className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{data.activityLog.label}</p>
              <p className="text-xs text-slate-400">
                {data.activityLog.description}
              </p>
            </div>
            <ChevronRight className="ml-auto h-4 w-4 text-slate-300" />
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
