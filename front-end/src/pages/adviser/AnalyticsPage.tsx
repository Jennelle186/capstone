import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import {
  Activity,
  CheckCircle2,
  Clock,
  FileCheck,
  Loader2,
  Users,
} from "lucide-react";

import AnalyticsStatCard from "@/components/common/analytics/AnalyticsStatCard";
import PageHeader from "@/components/adviser/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useAdviserAnalytics } from "@/hooks/useAdviserAnalytics";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const COLORS_PIE = [
  "var(--chart-2, #10b981)",
  "var(--chart-1, #3b82f6)",
  "oklch(0.577 0.245 27.325)",
  "oklch(0.75 0.15 70.0)",
  "oklch(0.65 0.18 180.0)",
];

export default function AnalyticsPage() {
  const { stats, archived, loading, error } = useAdviserAnalytics();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-500">
        <Activity className="h-10 w-10 text-slate-300 mb-3" />
        <p className="text-sm font-semibold">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <PageHeader
          title="Analytics"
          subtitle="Overview of document submission activity and clearance progress."
        />
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AnalyticsStatCard
          icon={Users}
          iconColor="text-primary"
          iconBg="bg-primary/10"
          label="Total Advisees"
          value={stats?.totalStudents ?? 0}
          delay={0}
        />
        <AnalyticsStatCard
          icon={Clock}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          label="Pending Reviews"
          value={stats?.pendingReviews ?? 0}
          delay={0.05}
        />
        <AnalyticsStatCard
          icon={FileCheck}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          label="Submitted Today"
          value={stats?.submittedToday ?? 0}
          delay={0.1}
        />
        <AnalyticsStatCard
          icon={CheckCircle2}
          iconColor="text-emerald-600"
          iconBg="bg-emerald-50"
          label="Verified Docs"
          value={stats?.verifiedCount ?? 0}
          delay={0.15}
        />
      </div>

      {/* Progress Card */}
      <motion.div
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      >
        <h4 className="text-base font-semibold text-slate-900">
          Adviser Review Progress
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          Overall completion for program
        </p>
        <div className="mt-5 space-y-3">
          <div className="flex items-end justify-between">
            <span className="text-3xl font-extrabold text-emerald-600">
              {stats?.progressPercent ?? 0}%
            </span>
            <span className="text-xs text-slate-500 font-medium pb-1">
              Verification Rate
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${stats?.progressPercent ?? 0}%` }}
              transition={{ duration: 1, delay: 0.4, ease: "easeOut" }}
            />
          </div>
          <p className="text-[10px] text-slate-500 leading-normal">
            Based on document verification states. Verified documents are locked for official enrollment clearance.
          </p>
        </div>
      </motion.div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          <motion.div variants={fadeInUp} initial="hidden" animate="visible">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Monthly Submissions</CardTitle>
                <CardDescription>
                  Document submissions per month for the current school year
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={archived?.monthly_submissions ?? []}
                      margin={{ top: 10, right: 10, left: -20, bottom: 5 }}
                    >
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "transparent" }} />
                      <Bar dataKey="count" fill="var(--chart-1, #3b82f6)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} initial="hidden" animate="visible">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Processing Trend</CardTitle>
                <CardDescription>
                  Average days to verify documents this school year
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-3xl font-bold text-slate-900">
                      {archived?.avg_processing_days ?? "—"}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Avg. processing days</p>
                  </div>
                  <div className="flex-1">
                    <div className="relative h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, (archived?.avg_processing_days ?? 0) / 10 * 100)}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {archived?.total_submissions ?? 0} total submissions processed
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <motion.div variants={fadeInUp} initial="hidden" animate="visible">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Student Completion</CardTitle>
                <CardDescription>
                  Per-student completion status based on all required documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-52 w-full flex items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={archived?.student_status_distribution ?? []}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={3}
                        dataKey="count"
                        nameKey="status"
                      >
                        {(archived?.student_status_distribution ?? []).map((_: unknown, idx: number) => (
                          <Cell key={`cell-${idx}`} fill={COLORS_PIE[idx % COLORS_PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xl font-extrabold text-slate-900 leading-none">
                      {archived?.student_completion_rate ?? 0}%
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                      Complete
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 pt-2 text-xs font-semibold text-slate-500">
                  {(archived?.student_status_distribution ?? []).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS_PIE[idx % COLORS_PIE.length] }} />
                      <span className="capitalize">
                        {item.status}: <b className="text-slate-700">{item.count}</b>
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={fadeInUp} initial="hidden" animate="visible">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm">Clearance Progress</CardTitle>
                <CardDescription>
                  Overall completion rate across all advisees
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="relative h-20 w-20">
                    <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
                      <circle
                        cx="18" cy="18" r="15.5"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="3"
                      />
                      <circle
                        cx="18" cy="18" r="15.5"
                        fill="none"
                        stroke="var(--chart-1, #3b82f6)"
                        strokeWidth="3"
                        strokeDasharray={`${stats?.progressPercent ?? 0} ${100 - (stats?.progressPercent ?? 0)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-slate-900">
                      {stats?.progressPercent ?? 0}%
                    </span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-500">
                      <b className="text-slate-900">{stats?.verifiedCount ?? 0}</b> verified out of{" "}
                      <b className="text-slate-900">
                        {(stats?.pendingReviews ?? 0) + (stats?.verifiedCount ?? 0)}
                      </b> submitted
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {stats?.totalStudents ?? 0} total advisees
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
