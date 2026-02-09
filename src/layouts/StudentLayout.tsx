import { Outlet } from "react-router";
import { AppSidebar } from "@/components/student/App-Sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function StudentLayout() {
    return (
        <TooltipProvider>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="bg-slate-50 min-h-screen">
                    <div className="p-6 md:p-8 space-y-6">
                        <SidebarTrigger />
                        <Outlet />
                    </div>
                </SidebarInset>
            </SidebarProvider>
        </TooltipProvider>
    );
}
