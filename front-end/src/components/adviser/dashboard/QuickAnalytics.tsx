import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { Users, FileText, Clock, ArrowRight } from "lucide-react";
import type { QuickAnalyticsData } from "@/types/adviser-dashboard";

const defaultData: QuickAnalyticsData = {
  reviewProgress: 0,
};

interface QuickAnalyticsProps {
  data?: QuickAnalyticsData;
}

export default function QuickAnalytics({
  data = defaultData,
}: QuickAnalyticsProps) {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="space-y-6"
    >
      {/* Advisor Review Progress */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h4 className="text-base font-semibold text-slate-900">
          Advisor Review Progress
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          Overall completion for program
        </p>
        <div className="mt-5 space-y-3">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-extrabold text-emerald-600">
              {data.reviewProgress}%
            </span>
            <span className="text-xs text-slate-500 font-medium pb-1">
              Verification Rate
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${data.reviewProgress}%` }}
              transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
            />
          </div>
          <p className="text-[10px] text-slate-500 leading-normal">
            Based on document verification states. Verified documents are locked for official enrollment clearance.
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h4 className="text-base font-semibold text-slate-900">
            Quick Actions
          </h4>
          <p className="text-xs text-slate-500 mt-1">
            Academic task shortcuts
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          <button
            onClick={() => navigate("/adviser/students")}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 text-left transition"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Review Advisees Grid
                </span>
                <span className="text-[10px] text-slate-500">
                  Regular, Shiftees and Transferees
                </span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>

          <button
            onClick={() => navigate("/adviser/analytics")}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 text-left transition"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <FileText className="h-4 w-4" />
              </span>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Program Analytics
                </span>
                <span className="text-[10px] text-slate-500">
                  CET, enrollment, addressing metrics
                </span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>

          <button
            onClick={() => navigate("/adviser/archived")}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/50 text-left transition"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <Clock className="h-4 w-4" />
              </span>
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Archived Sessions
                </span>
                <span className="text-[10px] text-slate-500">
                  S.Y 2024-2025 and earlier records
                </span>
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-slate-400 shrink-0" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
