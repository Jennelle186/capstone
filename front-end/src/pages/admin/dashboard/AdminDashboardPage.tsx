import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import { StatCardGrid } from "@/components/admin/dashboard/stat-card-grid";
import { DepartmentEfficiencyCard } from "@/components/admin/dashboard/department-efficiency-card";
import { QuickActionsCard } from "@/components/admin/dashboard/quick-actions-card";
import SetupChecklistCard from "@/components/tutorial/SetupChecklistCard";
import WelcomeDialog from "@/components/tutorial/WelcomeDialog";
import { useAdminDashboard } from "@/hooks/useAdminDashboard";
import { useAdminSetupStatus } from "@/hooks/useAdminSetupStatus";
import { useAdminTutorialProgress } from "@/hooks/useAdminTutorialProgress";

export default function AdminDashboardPage() {
  const { data, loading } = useAdminDashboard();
  const { status: setupStatus } = useAdminSetupStatus();
  const tutorial = useAdminTutorialProgress();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const navigate = useNavigate();

  // Mark the main tutorial done once every required step is complete. This is silent,
  // so an admin who finished setup before the checklist existed is not interrupted.
  useEffect(() => {
    if (!tutorial.loaded || !setupStatus) return;
    if (setupStatus.core_complete && !tutorial.state.mainDone) {
      void tutorial.update({ mainDone: true });
    }
    // tutorial.update is stable per user; depend on the values that matter.
  }, [tutorial.loaded, setupStatus, tutorial.state.mainDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Show the one-time welcome only while required setup is still missing.
  useEffect(() => {
    if (!tutorial.loaded || !setupStatus) return;
    if (!setupStatus.core_complete && !tutorial.state.welcomeSeen) {
      setWelcomeOpen(true);
    }
  }, [tutorial.loaded, setupStatus, tutorial.state.welcomeSeen]);

  // Shown while setup is incomplete and the admin hasn't hidden it. A finished tutorial
  // with complete setup stays hidden; "Restart tutorial" in the Help menu brings it back when needed.
  const showChecklist =
    Boolean(setupStatus) &&
    !tutorial.state.checklistHidden &&
    !(tutorial.state.mainDone && setupStatus?.core_complete);

  const closeWelcome = () => {
    setWelcomeOpen(false);
    void tutorial.update({ welcomeSeen: true });
  };

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

      {setupStatus && !setupStatus.steps.find((step) => step.key === "school_year")?.done ? (
        <motion.div
          variants={fadeInUp}
          className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="text-sm font-semibold text-amber-900">Set up the school year first</p>
            <p className="text-sm text-amber-800">
              Students, advisers and every other setup step belong to an active school year.
            </p>
          </div>
          <Button onClick={() => navigate("/admin/settings/school-year?guide=1")}>Set up school year</Button>
        </motion.div>
      ) : null}

      {showChecklist && setupStatus ? (
        <motion.div variants={fadeInUp} data-tour="dashboard-checklist">
          <SetupChecklistCard
            status={setupStatus}
            onHide={() => void tutorial.update({ checklistHidden: true })}
          />
        </motion.div>
      ) : null}

      <WelcomeDialog open={welcomeOpen} onClose={closeWelcome} status={setupStatus} />

      <motion.div variants={fadeInUp}>
        <div data-tour="dashboard-stats">
          <StatCardGrid data={data ?? null} />
        </div>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <div data-tour="dashboard-clearance">
          <DepartmentEfficiencyCard data={data?.departmentClearance ?? null} />
        </div>
      </motion.div>

      <motion.div variants={fadeInUp}>
        <div data-tour="dashboard-quick-actions">
          <QuickActionsCard />
        </div>
      </motion.div>
    </motion.div>
  );
}
