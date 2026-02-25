import { BadgeCheck, LayoutDashboard, LogOut, Upload, UserCog } from 'lucide-react'
import CommonAppSidebar from '@/components/common/AppSidebar'
import type { SidebarGroupConfig } from '@/components/common/AppSidebar'

const studentGroups: SidebarGroupConfig[] = [
    {
        label: 'Dashboards',
        items: [{ title: 'Overview', icon: LayoutDashboard, url: '/student/dashboard' }],
    },
    {
        label: 'Pages',
        items: [
            { title: 'Upload Documents', icon: Upload, url: '/student/upload' },
            { title: 'Verified Documents', icon: BadgeCheck, url: '#' },
            { title: 'Profile Settings', icon: UserCog, url: '/student/profile' },
            { title: 'Logout', icon: LogOut, url: '#' },
        ],
    },
]

export function AppSidebar() {
    return (
        <CommonAppSidebar
            portalLabel="Student Portal"
            portalTitle="Document Management System"
            groups={studentGroups}
            userName="Tessa Herondale"
            userEmail="tessa@example.com"
            userFallback="TH"
            collapsible="icon"
        />
    )
}
