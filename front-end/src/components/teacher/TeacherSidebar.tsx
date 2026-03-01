import { LayoutDashboard, LogOut, Upload, UserCircle2, Users } from "lucide-react";
import CommonAppSidebar from "@/components/common/AppSidebar";
import type { SidebarGroupConfig } from "@/components/common/AppSidebar";

const teacherGroups: SidebarGroupConfig[] = [
  {
    label: "Dashboards",
    items: [{ title: "Overview", icon: LayoutDashboard, url: "/teacher/dashboard" }],
  },
  {
    label: "Pages",
    items: [
      { title: "Upload", icon: Upload, url: "#" },
      { title: "Account", icon: UserCircle2, url: "#" },
      { title: "Student Profile", icon: Users, url: "#" },
      { title: "Logout", icon: LogOut, url: "#" },
    ],
  },
];

export default function TeacherSidebar() {
  return (
    <CommonAppSidebar
      portalLabel="Teacher Portal"
      portalTitle="Document Management System"
      groups={teacherGroups}
      userName="Teacher"
      userEmail="teacher@example.com"
      userFallback="TR"
      collapsible="icon"
    />
  );
}
