import { useAdviserProfile } from "@/hooks/useAdviserProfile";
import WelcomeSection from "@/components/adviser/dashboard/WelcomeSection";
import StatCards from "@/components/adviser/dashboard/StatCards";
import RecentSubmissionsTable from "@/components/adviser/dashboard/RecentSubmissionsTable";
import QuickAnalytics from "@/components/adviser/dashboard/QuickAnalytics";

export default function AdviserDashboard() {
  const { profile, isLoading } = useAdviserProfile();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <WelcomeSection profile={profile} isLoading={isLoading} />
      <StatCards />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RecentSubmissionsTable />
        </div>
        <div className="lg:col-span-4">
          <QuickAnalytics />
        </div>
      </div>
    </div>
  );
}
