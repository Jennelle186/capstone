import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import {
  History,
  Layers,
  Clock,
  ChevronRight,
  Database,
} from "lucide-react";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/adviser/ui/PageHeader";
import ProgramSelector from "@/components/adviser/dashboard/ProgramSelector";
import { useAdviserSchoolYears } from "@/hooks/useAdviserSchoolYears";
import { useAdviserProgramScope } from "@/hooks/useAdviserProgramScope";
import { useStableToken } from "@/hooks/useStableToken";
import { fetchWithClerkAuth } from "@/lib/api";
import type { AdviserStudent } from "@/types/adviser-students";
import { CLASSIFICATION_LABELS } from "@/types/adviser-students";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const COLORS_PIE = [
  "var(--chart-2, #10b981)",
  "var(--chart-1, #3b82f6)",
  "oklch(0.577 0.245 27.325)",
  "oklch(0.75 0.15 70.0)",
];

interface ArchivedAnalytics {
  school_year: string;
  total_students: number;
  total_submissions: number;
  verification_rate: number;
  avg_processing_days: number | null;
  status_distribution: { status: string; count: number }[];
  monthly_submissions: { month: string; count: number }[];
}

interface ArchivedApiResponse {
  analytics: ArchivedAnalytics;
  students: AdviserStudent[];
}

const defaultAnalytics: ArchivedAnalytics = {
  school_year: "",
  total_students: 0,
  total_submissions: 0,
  verification_rate: 0,
  avg_processing_days: null,
  status_distribution: [],
  monthly_submissions: [],
};

export default function ArchivedPage() {
  const navigate = useNavigate();
  const getTokenRef = useStableToken();
  const { years: schoolYears, loading: loadingYears } = useAdviserSchoolYears();
  const { selectedDepartmentId, setSelectedDepartmentId } = useAdviserProgramScope();

  const [selectedYearId, setSelectedYearId] = useState("");
  const [students, setStudents] = useState<AdviserStudent[]>([]);
  const [analytics, setAnalytics] = useState<ArchivedAnalytics>(defaultAnalytics);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (schoolYears.length === 0) return;
    const current = schoolYears.find((sy) => sy.is_current) ?? schoolYears[0];
    setSelectedYearId(current.id);
  }, [schoolYears]);

  useEffect(() => {
    if (!selectedYearId) return;

    let isMounted = true;
    setLoadingData(true);

    async function fetchArchivedData() {
      try {
        const token = await getTokenRef.current();
        if (!token) return;

        const res = await fetchWithClerkAuth(
          `/api/adviser/archived?school_year_id=${selectedYearId}${selectedDepartmentId ? `&department_id=${selectedDepartmentId}` : ""}`,
          token,
        );
        if (!res.ok) return;
        const data: ArchivedApiResponse = await res.json();
        if (!isMounted) return;
        setAnalytics(data.analytics);
        setStudents(data.students);
      } catch (err) {
        console.error("Failed to load archived data:", err);
      } finally {
        if (isMounted) setLoadingData(false);
      }
    }

    void fetchArchivedData();
    return () => { isMounted = false; };
  }, [selectedYearId, selectedDepartmentId, getTokenRef]);

  // Reset the department filter whenever the school year changes because a
  // department may not be available for the newly selected school year.
  const handleYearChange = useCallback((value: string) => {
    setSelectedYearId(value);
    setSelectedDepartmentId(null);
  }, [setSelectedDepartmentId]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Archived Advisees"
            subtitle="Historical student list data and document clearance audits from closed sessions."
          />
          <Badge className="bg-slate-200 text-slate-700 font-extrabold px-3 py-0.5 rounded-lg flex items-center gap-1.5 shadow-sm mt-1 shrink-0">
            <History className="h-3.5 w-3.5 text-slate-500" />
            Archived Catalog
          </Badge>
        </div>
      </motion.div>

      {/* Year Selector */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-slate-400" />
            <div>
              <p className="text-xs font-bold text-slate-500">Academic Year Repository</p>
              <p className="text-[10px] text-slate-400">Query archived cohorts</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            <div className="w-full sm:w-64">
              {loadingYears ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <Select value={selectedYearId} onValueChange={handleYearChange}>
                  <SelectTrigger className="font-bold text-xs h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {schoolYears.map((sy) => (
                      <SelectItem key={sy.id} value={sy.id}>
                        School Year {sy.name} {sy.is_current ? "(Current)" : "(Archived)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <ProgramSelector schoolYearId={selectedYearId} />
          </div>
        </Card>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
            <Layers className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Cohort</p>
            {loadingData ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{analytics.total_students} Students</p>
            )}
            <p className="text-[10px] text-slate-500 mt-0.5">Enrollment records</p>
          </div>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Database className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Submissions</p>
            {loadingData ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{analytics.total_submissions} Files</p>
            )}
            <p className="text-[10px] text-slate-500 mt-0.5">Archived folder items</p>
          </div>
        </Card>

        <Card className="space-y-3 p-6">
          <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
            <span>Verification Rate</span>
            {loadingData ? (
              <Skeleton className="h-4 w-10" />
            ) : (
              <span className="font-bold text-emerald-600">{analytics.verification_rate}%</span>
            )}
          </div>
          {loadingData ? (
            <Skeleton className="h-1.5 w-full" />
          ) : (
            <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${analytics.verification_rate}%` }}
              />
            </div>
          )}
          <p className="text-[10px] text-slate-400">Total verified files</p>
        </Card>

        <Card className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Process Speeds</p>
            {loadingData ? (
              <Skeleton className="h-7 w-12 mt-1" />
            ) : (
              <p className="text-xl font-bold text-slate-900 leading-tight mt-0.5">{analytics.avg_processing_days ?? "—"} Days</p>
            )}
            <p className="text-[10px] text-slate-500 mt-0.5">Average verification time</p>
          </div>
        </Card>
      </div>

      {/* Two-column layout: Student Grid + Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Student Grid */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Cohort Student Grid</h2>
            <span className="text-[10px] text-slate-400 font-bold">
              Showing {students.length} records
            </span>
          </div>

          {loadingData ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="h-40" />
              ))}
            </div>
          ) : (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {students.map((s) => (
                <motion.div
                  key={s.id}
                  variants={fadeInUp}
                  onClick={() => navigate(`/adviser/students/${s.id}`)}
                  className="group cursor-pointer"
                >
                  <Card className="p-4 flex flex-col justify-between border-slate-200 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback>{s.initials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="text-xs font-bold text-slate-900 group-hover:text-primary transition">
                            {s.name}
                          </h3>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{s.student_number}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {CLASSIFICATION_LABELS[s.classification as keyof typeof CLASSIFICATION_LABELS] || s.classification}
                        </Badge>
                        {s.application_status === "PENDING_DOCUMENTS" && (
                          <Badge className="bg-amber-100 text-amber-700 text-[10px] font-semibold">
                            Pending Docs
                          </Badge>
                        )}
                        {s.application_status === "SUBMITTED_COMPLETE" && (
                          <Badge className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                            Complete
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
                      <span>
                        Requirements: <b>{s.documents_submitted}/{s.documents_total}</b>
                      </span>
                      <span className="font-bold text-slate-700">{s.completion_pct}% Satisfied</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[10px] font-extrabold text-slate-500 uppercase">
                      <span>Audit Record</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 group-hover:translate-x-1 group-hover:text-primary transition-all" />
                    </div>
                  </Card>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>

        {/* Right: Analytics Charts */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Previous Year Analytics</CardTitle>
              <CardDescription>
                Audits for Academic Season {analytics.school_year}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pie Chart */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Document Status Distribution
                </p>
                <div className="h-44 w-full flex items-center justify-center relative bg-slate-50 rounded-xl p-2 border border-slate-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.status_distribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={65}
                        paddingAngle={3}
                        dataKey="count"
                        nameKey="status"
                      >
                        {analytics.status_distribution.map((_, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS_PIE[index % COLORS_PIE.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-base font-extrabold text-slate-900 leading-none">
                      {analytics.verification_rate}%
                    </span>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter mt-1">
                      Cleared
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 gap-x-2 pt-2 text-[10px] font-semibold text-slate-500 px-1">
                  {analytics.status_distribution.map((item, idx: number) => (
                    <div key={idx} className="flex items-center gap-1.5 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: COLORS_PIE[idx % COLORS_PIE.length] }} />
                      <span className="capitalize text-[10px]">
                        {item.status}: <b className="text-slate-700">{item.count}</b>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Monthly Submissions Bar Chart */}
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Submissions Speed by Month
                </p>
                <div className="h-32 w-full bg-slate-50 rounded-xl p-2 border border-slate-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.monthly_submissions} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                      <XAxis dataKey="month" stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={9} tickLine={false} axisLine={false} />
                      <Bar dataKey="count" fill="var(--chart-3, #f59e0b)" radius={[4, 4, 0, 0]} />
                      <Tooltip cursor={{ fill: "transparent" }} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
