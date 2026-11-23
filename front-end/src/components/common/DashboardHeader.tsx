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
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="shrink-0 md:hidden" />
        {/* On phones only the page name is shown, so the breadcrumb stays on one line. */}
        <p className="min-w-0 truncate text-sm text-muted-foreground">
          <span className="hidden sm:inline">{sectionLabel}</span>
          <span className="hidden px-2 sm:inline">/</span>
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
