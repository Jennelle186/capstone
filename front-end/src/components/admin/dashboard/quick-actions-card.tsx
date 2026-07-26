import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, FileJson, ClipboardCheck } from "lucide-react";

interface QuickAction {
  label: string;
  icon: "CalendarDays" | "FileJson" | "ClipboardCheck";
  variant: "default" | "outline";
  href: string;
}

const defaultActions: QuickAction[] = [
  { label: "Configure School Year", icon: "CalendarDays", variant: "default", href: "/admin/settings/school-year" },
  { label: "Build Schema", icon: "FileJson", variant: "outline", href: "/admin/extraction-schemas" },
  { label: "Manage Requirements", icon: "ClipboardCheck", variant: "outline", href: "/admin/requirements" },
];

const iconMap = {
  CalendarDays,
  FileJson,
  ClipboardCheck,
} as const;

interface QuickActionsCardProps {
  actions?: QuickAction[];
}

export function QuickActionsCard({ actions = defaultActions }: QuickActionsCardProps) {
  return (
    <Card className="border-0 shadow-sm bg-linear-to-br from-muted to-background">
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Quick Actions
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Common tasks you might want to perform
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = iconMap[action.icon];
              return (
                <Link key={action.label} to={action.href}>
                  <Badge
                    variant={action.variant}
                    className="cursor-pointer px-3 py-1.5 text-xs font-medium gap-1.5"
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {action.label}
                  </Badge>
                </Link>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
