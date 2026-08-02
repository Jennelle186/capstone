import { LayoutDashboard, Users, Building2, BarChart3, CalendarDays, ClipboardCheck, FileText, FileJson, LogOut, GraduationCap, TrendingUp } from "lucide-react";
import CommonAppSidebar from "@/components/common/AppSidebar";
import LogoutConfirmDialog from "@/components/common/LogoutConfirmDialog";
import type { SidebarGroupConfig } from "@/components/common/AppSidebar";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export function AdminSidebar() {
    const { signOut } = useClerk();
    const { user } = useUser();
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
    const [isLoggingOut, setIsLoggingOut] = useState(false);

    const handleLogoutConfirm = async () => {
        if (isLoggingOut) return;

        setIsLoggingOut(true);
        try {
            await signOut({ redirectUrl: "/auth/login" });
        } catch (error) {
            console.error("Logout failed:", error);
            toast.error("Failed to log out. Please try again.", {
                position: "bottom-right",
            });
            setLogoutDialogOpen(false);
        } finally {
            setIsLoggingOut(false);
        }
    };

    const adminGroups: SidebarGroupConfig[] = useMemo(
        () => [
            {
                label: "Dashboards",
                items: [
                    { title: "Overview", icon: LayoutDashboard, url: "/admin" },
                ],
            },
            {
                label: "Management",
                items: [
                    { title: "Advisers", icon: Users, url: "/admin/advisers" },
                    { title: "Academic Programs", icon: Building2, url: "/admin/departments" },
                    { title: "Students", icon: GraduationCap, url: "/admin/students" },
                    { title: "Document Types", icon: FileText, url: "/admin/document-types" },
                    {
                        title: "Schema Builder",
                        icon: FileJson,
                        url: "/admin/extraction-schemas",
                        children: [
                            { title: "Builder", url: "/admin/extraction-schemas" },
                            { title: "Registry", url: "/admin/extraction-schemas/registry" },
                        ],
                    },
                    { title: "Requirements", icon: ClipboardCheck, url: "/admin/requirements" },
                    { title: "Analytics", icon: TrendingUp, url: "/admin/analytics" },
                    { title: "Reports", icon: BarChart3, url: "/admin/reports" },
                ],
            },
            {
                label: "Settings",
                items: [
                    { title: "School Year", icon: CalendarDays, url: "/admin/settings/school-year" },
                    {
                        title: "Logout",
                        icon: LogOut,
                        url: "/auth/login",
                        onClick: (event) => {
                            event.preventDefault();
                            setLogoutDialogOpen(true);
                        },
                    },
                ],
            },
        ],
        [],
    );

    const userName =
        user?.fullName ??
        [user?.firstName, user?.lastName].filter(Boolean).join(" ") ??
        "Admin User";
    const userEmail = user?.primaryEmailAddress?.emailAddress ?? "No email available";
    const userFallback = userName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("") || "AD";

    return (
        <>
            <CommonAppSidebar
                portalLabel="Admin Portal"
                portalTitle="Document Management System"
                groups={adminGroups}
                userName={userName}
                userEmail={userEmail}
                userFallback={userFallback}
                userAvatarSrc={user?.imageUrl}
                collapsible="icon"
            />
            <LogoutConfirmDialog
                open={logoutDialogOpen}
                onOpenChange={setLogoutDialogOpen}
                onConfirm={handleLogoutConfirm}
                isLoading={isLoggingOut}
            />
        </>
    );
}
