import { Outlet, useLocation } from "react-router";
import { Bell, HelpCircle, Search } from "lucide-react";
import { AppSidebar } from "@/components/student/App-Sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import DashboardHeader from "@/components/common/DashboardHeader";

export default function StudentLayout() {
    const location = useLocation();
    const pageLabelByPath: Record<string, string> = {
        "/student/dashboard": "Student Dashboard",
        "/student/upload": "Upload Documents",
        "/student/profile": "Profile Settings",
        "/student/extraction": "Extraction Detail",
    };
    const pageLabel = pageLabelByPath[location.pathname]
        ?? Object.entries(pageLabelByPath).find(([key]) => location.pathname.startsWith(key))?.[1]
        ?? "Student";

    return (
        <TooltipProvider>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="bg-slate-50 min-h-screen">
                    <DashboardHeader sectionLabel="Dashboards" pageLabel={pageLabel}>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Search documents..."
                                className="pl-10 h-9 rounded-xl w-64 border-slate-200"
                            />
                        </div>
                        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-primary">
                            <Bell className="h-5 w-5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-slate-500 hover:text-primary">
                            <HelpCircle className="h-5 w-5" />
                        </Button>
                        <div className="h-6 w-px bg-slate-200" />
                        <span className="text-sm font-semibold text-primary">Document Management</span>
                    </DashboardHeader>
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
