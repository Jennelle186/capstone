import { useAdviserProfile } from "@/hooks/useAdviserProfile";
import { useAdviserAnalytics } from "@/hooks/useAdviserAnalytics";
import WelcomeSection from "@/components/adviser/dashboard/WelcomeSection";
import StatCards from "@/components/adviser/dashboard/StatCards";
import RecentSubmissionsTable from "@/components/adviser/dashboard/RecentSubmissionsTable";
import QuickAnalytics from "@/components/adviser/dashboard/QuickAnalytics";

export default function AdviserDashboard() {
  const { profile, isLoading: profileLoading } = useAdviserProfile();
  const { stats } = useAdviserAnalytics();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <WelcomeSection profile={profile} isLoading={profileLoading} />
      <StatCards stats={stats ?? undefined} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <RecentSubmissionsTable />
        </div>
        <div className="lg:col-span-4">
          <QuickAnalytics
            data={{ reviewProgress: stats?.progressPercent ?? 0 }}
          />
        </div>
      </div>
    </div>
  );
}
