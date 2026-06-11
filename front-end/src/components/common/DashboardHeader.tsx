import { type ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";

type DashboardHeaderProps = {
  sectionLabel?: string;
  pageLabel?: string;
  children?: ReactNode;
};

export default function DashboardHeader({
  sectionLabel = "Dashboards",
  pageLabel = "Overview",
  children,
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

      {children ? (
        <div className="flex items-center gap-3">
          {children}
        </div>
      ) : null}
    </header>
  );
}
