import { Outlet } from "react-router";

import TeacherHeader from "@/components/teacher/TeacherHeader";
import TeacherSidebar from "@/components/teacher/TeacherSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function TeacherDashboardLayout() {
  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <TeacherSidebar />
        <SidebarInset className="min-h-screen bg-background">
          <TeacherHeader />
          <main className="flex-1 p-4 md:p-6">
            <div className="mx-auto w-full max-w-7xl">
              <Outlet />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
