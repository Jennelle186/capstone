import { Outlet, useLocation } from "react-router";
import { AnimatePresence, motion } from "framer-motion";

import TeacherHeader from "@/components/teacher/TeacherHeader";
import TeacherSidebar from "@/components/teacher/TeacherSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function TeacherDashboardLayout() {
  const location = useLocation();

  return (
    <TooltipProvider>
      <SidebarProvider defaultOpen>
        <TeacherSidebar />
        <SidebarInset className="min-h-screen bg-slate-50">
          <TeacherHeader />
          <main className="flex-1 p-6 md:p-8">
            <div className="mx-auto w-full max-w-7xl">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
