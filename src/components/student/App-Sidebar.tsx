'use client'

import * as React from 'react'
import {
    LayoutDashboard,
    Upload,
    BadgeCheck,
    UserCog,
    LogOut,
} from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { motion } from 'framer-motion'

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

// Sample navigation data
const mainNavigation = [
    { title: 'Overview', icon: LayoutDashboard, url: '/student/dashboard' },
]

const projects = [
    { title: 'Upload Documents', icon: Upload, url: '/student/upload' },
    { title: 'Verified Documents', icon: BadgeCheck, url: '#' },
    { title: 'Profile Settings', icon: UserCog, url: '#' },
    { title: 'Logout', icon: LogOut, url: '#' },
]

export function AppSidebar() {
    const { state } = useSidebar()
    const location = useLocation()
    const MotionLink = React.useMemo(() => motion.create(Link), [])
    const containerVariants = React.useMemo(
        () => ({
            hidden: { opacity: 0 },
            show: {
                opacity: 1,
                transition: { staggerChildren: 0.06, delayChildren: 0.05 },
            },
        }),
        [],
    )
    const itemVariants = React.useMemo(
        () => ({
            hidden: { opacity: 0, y: 8 },
            show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
        }),
        [],
    )

    return (
        <Sidebar
            collapsible="icon"
            className="border-r border-sidebar-border bg-background/80 backdrop-blur-md"
        >
            {/* Header */}
            <SidebarHeader className="border-b border-sidebar-border">
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35 }}
                    className="flex items-center gap-3 px-2 py-1"
                >
                    <div className="relative">
                        <div className="absolute -inset-1 rounded-xl bg-linear-to-br from-emerald-400/30 via-cyan-400/30 to-blue-500/30 blur" />
                        <img
                            src="/ccs-logo.jpg"
                            alt="CCS logo"
                            className="relative size-9 rounded-xl border border-white/60 object-cover shadow-sm"
                        />
                    </div>
                    {state === 'expanded' && (
                        <div className="leading-tight">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                Student Portal
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                                Document Management System
                            </div>
                        </div>
                    )}
                </motion.div>
            </SidebarHeader>

            {/* Main Content */}
            <SidebarContent>
                {/* Main Navigation */}
                <SidebarGroup>
                    <SidebarGroupLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                        Dashboards
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="space-y-2">
                            <motion.div variants={containerVariants} initial="hidden" animate="show">
                                {mainNavigation.map((item) => {
                                    const isActive = location.pathname === item.url
                                    return (
                                        <motion.div key={item.title} variants={itemVariants}>
                                            <SidebarMenuItem>
                                                <SidebarMenuButton
                                                    asChild
                                                    isActive={isActive}
                                                    tooltip={item.title}
                                                >
                                                    <MotionLink
                                                        to={item.url}
                                                        whileHover={{ x: 4 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                                        className={`group relative flex items-center gap-2 rounded-md px-2 py-2 ${isActive
                                                                ? 'bg-slate-100/80 pl-3 text-slate-900'
                                                                : 'text-slate-500'
                                                            }`}
                                                    >
                                                        {isActive && (
                                                            <motion.span
                                                                layoutId="activeIndicator"
                                                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                                                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-md bg-green-600"
                                                            />
                                                        )}
                                                        <item.icon className="size-4 text-slate-600 group-hover:text-slate-900" />
                                                        <span>{item.title}</span>
                                                    </MotionLink>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        </motion.div>
                                    )
                                })}
                            </motion.div>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {/* Projects Section */}
                <SidebarGroup>
                    <SidebarGroupLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                        Pages
                    </SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu className="space-y-2">
                            <motion.div variants={containerVariants} initial="hidden" animate="show">
                                {projects.map((item) => {
                                    const isActive = location.pathname === item.url
                                    return (
                                        <motion.div key={item.title} variants={itemVariants}>
                                            <SidebarMenuItem>
                                                <SidebarMenuButton asChild tooltip={item.title}>
                                                    <MotionLink
                                                        to={item.url}
                                                        whileHover={{ x: 4 }}
                                                        whileTap={{ scale: 0.97 }}
                                                        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                                        className={`group relative flex items-center gap-2 rounded-md px-2 py-2 ${isActive
                                                                ? 'bg-slate-100/80 pl-3 text-slate-900'
                                                                : 'text-slate-500'
                                                            }`}
                                                    >
                                                        {isActive && (
                                                            <motion.span
                                                                layoutId="activeIndicator"
                                                                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                                                className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-md bg-green-600"
                                                            />
                                                        )}
                                                        <item.icon className="size-4 text-slate-600 group-hover:text-slate-900" />
                                                        <span>{item.title}</span>
                                                    </MotionLink>
                                                </SidebarMenuButton>
                                            </SidebarMenuItem>
                                        </motion.div>
                                    )
                                })}
                            </motion.div>
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            {/* Footer */}
            <SidebarFooter className="mt-auto">
                {/* User Profile Section */}
                <div className="border-t border-sidebar-border pt-2">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton size="lg" className="hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent">
                                <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                    className="flex w-full items-center gap-2"
                                >
                                    <Avatar className="size-7 rounded-lg border border-white/70">
                                        <AvatarImage src="/ccs-logo.jpg" />
                                        <AvatarFallback>TH</AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-semibold">Tessa Herondale</span>
                                        <span className="truncate text-xs text-sidebar-foreground/70">
                                            tessa@example.com
                                        </span>
                                    </div>
                                </motion.div>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </div>
            </SidebarFooter>
        </Sidebar>
    )
}
