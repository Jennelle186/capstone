import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ActivityItem {
  action: string;
  detail: string;
  time: string;
  type: "update" | "add" | "remove" | "revoked" | "granted";
}

const defaultActivity: ActivityItem[] = [
  { action: "User role updated", detail: "John Doe → Admin", time: "2 mins ago", type: "update" },
  { action: "Access granted", detail: "Jane Smith - Teacher Access", time: "15 mins ago", type: "granted" },
  { action: "User registered", detail: "Michael Johnson - Student", time: "1 hour ago", type: "add" },
  { action: "Access revoked", detail: "Sarah Lee - Removed access", time: "2 hours ago", type: "revoked" },
  { action: "Report generated", detail: "Monthly user analytics", time: "3 hours ago", type: "update" },
];

const badgeVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  update: "secondary",
  add: "default",
  granted: "default",
  revoked: "destructive",
  remove: "destructive",
};

const badgeLabel: Record<string, string> = {
  update: "Updated",
  add: "Registered",
  granted: "Granted",
  revoked: "Revoked",
  remove: "Removed",
};

interface RecentActivityCardProps {
  activities?: ActivityItem[];
}

export function RecentActivityCard({ activities = defaultActivity }: RecentActivityCardProps) {
  return (
    <Card className="border-0 shadow-sm h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground tracking-wide uppercase">
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activities.map((activity, index) => (
          <div key={index} className="flex items-start gap-3">
            <Badge
              variant={badgeVariant[activity.type] ?? "secondary"}
              className="mt-0.5 shrink-0 text-[10px] px-1.5 py-0 leading-normal"
            >
              {badgeLabel[activity.type] ?? activity.type}
            </Badge>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{activity.action}</p>
              <p className="text-xs text-muted-foreground truncate">{activity.detail}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{activity.time}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
