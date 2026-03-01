import { Bell } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";

type DashboardHeaderProps = {
  sectionLabel?: string;
  pageLabel?: string;
};

export default function DashboardHeader({
  sectionLabel = "Dashboards",
  pageLabel = "Overview",
}: DashboardHeaderProps) {
  return (
    <header className="flex h-16 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-3">
        <SidebarTrigger className="md:hidden" />
        <p className="text-sm text-muted-foreground">
          <span>{sectionLabel}</span>
          <span className="px-2">/</span>
          <span className="font-medium text-foreground">{pageLabel}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center text-muted-foreground">
          <Bell className="size-4" aria-hidden="true" focusable="false" />
        </div>
      </div>
    </header>
  );
}
