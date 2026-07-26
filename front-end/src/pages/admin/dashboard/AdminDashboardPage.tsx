import { motion } from "framer-motion";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import { StatCardGrid } from "@/components/admin/dashboard/stat-card-grid";
import { DepartmentEfficiencyCard } from "@/components/admin/dashboard/department-efficiency-card";
import { RecentActivityCard } from "@/components/admin/dashboard/recent-activity-card";
import { QuickActionsCard } from "@/components/admin/dashboard/quick-actions-card";
import { useAdminDashboard } from "@/hooks/useAdminDashboard";

export default function AdminDashboardPage() {
  const { data, loading } = useAdminDashboard();

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={staggerContainer}
      className="space-y-6"
    >
      <motion.div variants={fadeInUp}>
        <AdminPageHeader
          title="Welcome back, Admin!"
          description={
            loading
              ? "Loading dashboard data..."
              : data?.schoolYear
                ? `Here's the dashboard for the overall statistics of ${data.schoolYear}.`
                : "Here's the dashboard for the overall statistics of the college."
          }
        />
      </motion.div>

      <motion.div variants={fadeInUp}>
        <StatCardGrid data={data ?? null} />
      </motion.div>

      <div className="grid lg:grid-cols-3 gap-6">
        <motion.div variants={fadeInUp} className="lg:col-span-2">
          <DepartmentEfficiencyCard data={data?.departmentClearance ?? null} />
        </motion.div>
        <motion.div variants={fadeInUp}>
          <RecentActivityCard />
        </motion.div>
      </div>

      <motion.div variants={fadeInUp}>
        <QuickActionsCard />
      </motion.div>
    </motion.div>
  );
}
