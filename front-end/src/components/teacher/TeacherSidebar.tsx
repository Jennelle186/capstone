import { LayoutDashboard, LogOut, Upload, UserCircle2, Users } from "lucide-react";
import CommonAppSidebar from "@/components/common/AppSidebar";
import LogoutConfirmDialog from "@/components/common/LogoutConfirmDialog";
import type { SidebarGroupConfig } from "@/components/common/AppSidebar";
import { useClerk, useUser } from "@clerk/clerk-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function TeacherSidebar() {
  const { signOut } = useClerk();
  const { isLoaded, user } = useUser();
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Display info comes from Clerk (signed-in user). This is UI-only and does not affect RBAC enforcement.
  const userName = isLoaded
    ? (user?.fullName ?? user?.username ?? user?.firstName ?? "Teacher")
    : "Teacher";

  const userEmail = isLoaded
    ? (user?.primaryEmailAddress?.emailAddress ?? "teacher@example.com")
    : "teacher@example.com";

  const initials = (() => {
    // Fallback initials for the avatar.
    const source = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || userEmail;
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "T";
    return "T";
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

  const teacherGroups: SidebarGroupConfig[] = useMemo(
    () => [
      {
        label: "Dashboards",
        items: [
          { title: "Overview", icon: LayoutDashboard, url: "/teacher/dashboard" },
        ],
      },
      {
        label: "Pages",
        items: [
          { title: "Upload", icon: Upload, url: "#" },
          { title: "Account", icon: UserCircle2, url: "#" },
          { title: "Student Profile", icon: Users, url: "#" },
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
        portalLabel="Teacher Portal"
        portalTitle="Document Management System"
        groups={teacherGroups}
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
