import { Upload, Clock } from "lucide-react";
import { StatCard } from "./stat-card";

interface KPIData {
  totalSubmissions: number;
  weeklyNewSubmissions: number;
  pendingQueue: number;
  pendingQueueWeeklyDelta: number;
}

interface StatCardGridProps {
  data?: KPIData | null;
}

export function StatCardGrid({ data }: StatCardGridProps) {
  if (!data) {
    return (
      <div className="grid sm:grid-cols-2 gap-4">
        <StatCard
          title="Total Submissions"
          value="—"
          delta="— this week"
          icon={Upload}
          trend="neutral"
          borderClassName="border-t-primary/20"
        />
        <StatCard
          title="Pending Queue"
          value="—"
          delta="— this week"
          icon={Clock}
          trend="neutral"
          borderClassName="border-t-primary/20"
        />
      </div>
    );
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <StatCard
        title="Total Submissions"
        value={data.totalSubmissions.toLocaleString()}
        delta={`+${data.weeklyNewSubmissions.toLocaleString()} this week`}
        icon={Upload}
        trend="up"
        borderClassName="border-t-primary/20"
      />
      <StatCard
        title="Pending Queue"
        value={data.pendingQueue.toLocaleString()}
        delta={`${data.pendingQueueWeeklyDelta >= 0 ? "+" : ""}${data.pendingQueueWeeklyDelta.toLocaleString()} this week`}
        icon={Clock}
        trend={data.pendingQueueWeeklyDelta > 0 ? "down" : "up"}
        borderClassName="border-t-primary/20"
      />
    </div>
  );
}
