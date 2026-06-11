import { LayoutDashboard, LogOut, Upload, UserCog } from 'lucide-react'
import CommonAppSidebar from '@/components/common/AppSidebar'
import LogoutConfirmDialog from '@/components/common/LogoutConfirmDialog'
import type { SidebarGroupConfig } from '@/components/common/AppSidebar'
import { useClerk, useUser } from '@clerk/clerk-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

export function AppSidebar() {
    const { signOut } = useClerk()
    const { user } = useUser()
    const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)
    const [isLoggingOut, setIsLoggingOut] = useState(false)

    const handleLogoutConfirm = async () => {
        if (isLoggingOut) return

        setIsLoggingOut(true)
        try {
            await signOut({ redirectUrl: '/auth/login' })
        } catch (error) {
            console.error('Logout failed:', error)
            toast.error('Failed to log out. Please try again.', {
                position: 'bottom-right',
            })
            setLogoutDialogOpen(false)
        } finally {
            setIsLoggingOut(false)
        }
    }

    const studentGroups: SidebarGroupConfig[] = useMemo(
        () => [
            {
                label: 'Dashboards',
                items: [{ title: 'Overview', icon: LayoutDashboard, url: '/student/dashboard' }],
            },
            {
                label: 'Pages',
                items: [
                    { title: 'Upload Documents', icon: Upload, url: '/student/upload' },
                    { title: 'Profile Settings', icon: UserCog, url: '/student/profile' },
                    {
                        title: 'Logout',
                        icon: LogOut,
                        url: '/auth/login',
                        onClick: (event) => {
                            event.preventDefault()
                            setLogoutDialogOpen(true)
                        },
                    },
                ],
            },
        ],
        [],
    )

    const userName =
        user?.fullName ??
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ??
        'Student User'
    const userEmail = user?.primaryEmailAddress?.emailAddress ?? 'No email available'
    const userFallback = userName
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'SU'

    return (
        <>
            <CommonAppSidebar
                portalLabel='Student Portal'
                portalTitle='Document Management System'
                groups={studentGroups}
                userName={userName}
                userEmail={userEmail}
                userFallback={userFallback}
                userAvatarSrc={user?.imageUrl}
                collapsible='icon'
            />
            <LogoutConfirmDialog
                open={logoutDialogOpen}
                onOpenChange={setLogoutDialogOpen}
                onConfirm={handleLogoutConfirm}
                isLoading={isLoggingOut}
            />
        </>
    )
}
