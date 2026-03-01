import { Outlet, useLocation } from "react-router";
import { AppSidebar } from "@/components/student/App-Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import DashboardHeader from "@/components/common/DashboardHeader";

export default function StudentLayout() {
    const location = useLocation();
    const pageLabelByPath: Record<string, string> = {
        "/student/dashboard": "Student Dashboard",
        "/student/upload": "Upload Documents",
        "/student/profile": "Profile Settings",
    };
    const pageLabel = pageLabelByPath[location.pathname] ?? "Student";

    return (
        <TooltipProvider>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="bg-slate-50 min-h-screen">
                    <DashboardHeader sectionLabel="Dashboards" pageLabel={pageLabel} />
                    <div className="p-6 md:p-8">
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
                    <Toaster />
                </SidebarInset>
            </SidebarProvider>
        </TooltipProvider>
    );
}
