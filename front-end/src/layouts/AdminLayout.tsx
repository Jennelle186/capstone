import { Outlet, useLocation } from "react-router";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import DashboardHeader from "@/components/common/DashboardHeader";

export default function AdminLayout() {
    const location = useLocation();
    const routeMetaByPath: Record<string, { section: string; page: string }> = {
        "/admin": { section: "Management", page: "Admin Dashboard" },
        "/admin/advisers": { section: "Management", page: "Advisers" },
        "/admin/departments": { section: "Management", page: "Departments" },
        "/admin/document-types": { section: "Management", page: "Document Types" },
        "/admin/extraction-schemas": { section: "Management", page: "Extraction Schemas" },
        "/admin/requirements": { section: "Management", page: "Requirements" },
        "/admin/reports": { section: "Management", page: "Reports" },
        "/admin/settings/school-year": { section: "Settings", page: "School Year" },
    };
    const routeMeta = routeMetaByPath[location.pathname] ?? { section: "Management", page: "Admin Portal" };

    return (
        <TooltipProvider>
            <SidebarProvider>
                <AdminSidebar />
                <SidebarInset className="bg-slate-50 min-h-screen">
                    <DashboardHeader sectionLabel={routeMeta.section} pageLabel={routeMeta.page} />
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
