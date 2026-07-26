'use client'

import * as React from 'react'
import { Link, useLocation } from 'react-router'
import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
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
    SidebarMenuAction,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    useSidebar,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'

type SidebarItem = {
    title: string
    icon?: LucideIcon
    url: string
    onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void | Promise<void>
    children?: SidebarItem[]
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

function SidebarItemRenderer({ item }: { item: SidebarItem }) {
    const location = useLocation()
    const [open, setOpen] = React.useState(false)

    const isActive = location.pathname === item.url
    const hasActiveChild = item.children?.some((child) => location.pathname === child.url)
    const isExpanded = open || hasActiveChild

    if (item.children && item.children.length > 0) {
        return (
            <SidebarMenuItem>
                <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    isActive={isActive || hasActiveChild}
                >
                    <Link
                        to={item.url}
                        onClick={item.onClick}
                        className="group relative flex items-center gap-2 rounded-md px-2 py-2"
                    >
                        {item.icon ? (
                            <item.icon className="size-4 shrink-0 text-slate-600 group-hover:text-slate-900" />
                        ) : null}
                        <span className="truncate">{item.title}</span>
                    </Link>
                </SidebarMenuButton>
                <SidebarMenuAction
                    showOnHover
                    onClick={() => setOpen((prev) => !prev)}
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                >
                    <ChevronDown
                        className={cn(
                            'size-4 transition-transform',
                            isExpanded && 'rotate-180',
                        )}
                    />
                </SidebarMenuAction>
                {isExpanded ? (
                    <SidebarMenuSub>
                        {item.children.map((child) => {
                            const childActive = location.pathname === child.url
                            return (
                                <SidebarMenuSubItem key={child.title}>
                                    <SidebarMenuSubButton asChild isActive={childActive}>
                                        <Link
                                            to={child.url}
                                            onClick={child.onClick}
                                            className={childActive ? 'font-medium' : ''}
                                        >
                                            {child.title}
                                        </Link>
                                    </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                            )
                        })}
                    </SidebarMenuSub>
                ) : null}
            </SidebarMenuItem>
        )
    }

    return (
        <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={item.title} isActive={isActive}>
                <Link
                    to={item.url}
                    onClick={item.onClick}
                    className="group relative flex items-center gap-2 rounded-md px-2 py-2"
                >
                    {isActive ? (
                        <motion.span
                            layoutId="activeIndicator"
                            transition={{
                                type: 'spring',
                                stiffness: 380,
                                damping: 30,
                            }}
                            className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-md bg-green-600"
                        />
                    ) : null}
                    {item.icon ? (
                        <item.icon className="size-4 shrink-0 text-slate-600 group-hover:text-slate-900" />
                    ) : null}
                    <span className="truncate">{item.title}</span>
                </Link>
            </SidebarMenuButton>
        </SidebarMenuItem>
    )
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
                    {state === 'expanded' ? (
                        <div className="leading-tight">
                            <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                {portalLabel}
                            </div>
                            <div className="text-sm font-semibold text-slate-900">
                                {portalTitle}
                            </div>
                        </div>
                    ) : null}
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
                                    {group.items.map((item) => (
                                        <motion.div key={item.title} variants={itemVariants}>
                                            <SidebarItemRenderer item={item} />
                                        </motion.div>
                                    ))}
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
