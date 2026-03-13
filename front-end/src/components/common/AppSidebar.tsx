'use client'

import * as React from 'react'
import { Link, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

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

type SidebarItem = {
    title: string
    icon: LucideIcon
    url: string
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void | Promise<void>
}

type SidebarGroupConfig = {
    label: string
    items: SidebarItem[]
}

type AppSidebarProps = {
    portalLabel: string
    portalTitle: string
    groups: SidebarGroupConfig[]
    userName: string
    userEmail: string
    userAvatarSrc?: string
    userFallback: string
    collapsible?: 'offcanvas' | 'icon' | 'none'
    className?: string
}

export default function AppSidebar({
    portalLabel,
    portalTitle,
    groups,
    userName,
    userEmail,
    userAvatarSrc = '/ccs-logo.jpg',
    userFallback,
    collapsible = 'icon',
    className,
}: AppSidebarProps) {
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
            collapsible={collapsible}
            className={`border-r border-sidebar-border bg-background/80 backdrop-blur-md ${className ?? ''}`}
        >
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
                                {portalLabel}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                                {portalTitle}
                            </div>
                        </div>
                    )}
                </motion.div>
            </SidebarHeader>

            <SidebarContent>
                {groups.map((group) => (
                    <SidebarGroup key={group.label}>
                        <SidebarGroupLabel className="text-[11px] uppercase tracking-wide text-slate-500">
                            {group.label}
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu className="space-y-2">
                                <motion.div variants={containerVariants} initial="hidden" animate="show">
                                    {group.items.map((item) => {
                                        const isActive = location.pathname === item.url
                                        return (
                                            <motion.div key={item.title} variants={itemVariants}>
                                                <SidebarMenuItem>
                                                    <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                                                        <MotionLink
                                                            to={item.url}
                                                            onClick={item.onClick}
                                                            whileHover={{ x: 4 }}
                                                            whileTap={{ scale: 0.97 }}
                                                            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                                                            className={`group relative flex items-center gap-2 rounded-md px-2 py-2 ${
                                                                isActive
                                                                    ? 'bg-slate-100/80 pl-3 text-slate-900'
                                                                    : 'text-slate-500'
                                                            }`}
                                                        >
                                                            {isActive && (
                                                                <motion.span
                                                                    layoutId="activeIndicator"
                                                                    transition={{
                                                                        type: 'spring',
                                                                        stiffness: 380,
                                                                        damping: 30,
                                                                    }}
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
                ))}
            </SidebarContent>

            <SidebarFooter className="mt-auto">
                <div className="border-t border-sidebar-border pt-2">
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                size="lg"
                                className="hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
                            >
                                <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.1 }}
                                    className="flex w-full items-center gap-2"
                                >
                                    <Avatar className="size-7 rounded-lg border border-white/70">
                                        <AvatarImage src={userAvatarSrc} />
                                        <AvatarFallback>{userFallback}</AvatarFallback>
                                    </Avatar>
                                    <div className="grid flex-1 text-left text-sm leading-tight">
                                        <span className="truncate font-semibold">{userName}</span>
                                        <span className="truncate text-xs text-sidebar-foreground/70">
                                            {userEmail}
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

export type { SidebarGroupConfig, SidebarItem }
