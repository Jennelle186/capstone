import { BarChart3, History, LayoutDashboard, LogOut, UserCircle2, Users } from "lucide-react";
import CommonAppSidebar from "@/components/common/AppSidebar";
import LogoutConfirmDialog from "@/components/common/LogoutConfirmDialog";
import type { SidebarGroupConfig } from "@/components/common/AppSidebar";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function AdviserSidebar() {
  const { signOut } = useClerk();
  const { isLoaded, user } = useUser();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Display info comes from Clerk (signed-in user). This is UI-only and does not affect RBAC enforcement.
  const userName = isLoaded
    ? (user?.fullName ?? user?.username ?? user?.firstName ?? "Adviser")
    : "Adviser";

  // Use email as fallback for avatar initials if name is not available.
  const userEmail = isLoaded
    ? (user?.primaryEmailAddress?.emailAddress ?? "adviser@example.com")
    : "adviser@example.com";

  const initials = (() => {
    // Fallback initials for the avatar.
    const source = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || userEmail;
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "A";
    return "A";
  })();

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

  const adviserGroups: SidebarGroupConfig[] = useMemo(
    () => [
      {
        label: "Dashboards",
        items: [
          { title: "Overview", icon: LayoutDashboard, url: "/adviser/dashboard" },
        ],
      },
      {
        label: "Management",
        items: [
          { title: "My Advisees", icon: Users, url: "/adviser/students" },
          { title: "Analytics", icon: BarChart3, url: "/adviser/analytics" },
          { title: "Archived Sessions", icon: History, url: "/adviser/archived" },
          { title: "Profile Settings", icon: UserCircle2, url: "/adviser/profile" },

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

  return (
    <>
      <CommonAppSidebar
        portalLabel="Adviser Portal"
        portalTitle="Document Management System"
        groups={adviserGroups}
        userName={userName}
        userEmail={userEmail}
        userAvatarSrc={user?.imageUrl}
        userFallback={initials}
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
