import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import {
    Users,
    UserCheck,
    Shield,
    BarChart3,
    TrendingUp,
    TrendingDown,
    Clock,
    Plus,
    Lock,
} from "lucide-react";

const stats = [
    {
        title: "Total Users",
        value: "156",
        change: "+12",
        trend: "up",
        icon: Users,
        color: "text-emerald-600",
        bgColor: "bg-emerald-500/10",
    },
    {
        title: "Active Users",
        value: "142",
        change: "+8",
        trend: "up",
        icon: UserCheck,
        color: "text-cyan-600",
        bgColor: "bg-cyan-500/10",
    },
    {
        title: "Access Controls",
        value: "8",
        change: "+2",
        trend: "up",
        icon: Shield,
        color: "text-slate-600",
        bgColor: "bg-slate-500/10",
    },
    {
        title: "Reports Generated",
        value: "24",
        change: "+5",
        trend: "up",
        icon: BarChart3,
        color: "text-blue-600",
        bgColor: "bg-blue-500/10",
    },
];

const recentActivity = [
    { action: "User role updated", detail: "John Doe â†’ Admin", time: "2 mins ago", type: "update" },
    { action: "Access granted", detail: "Jane Smith - Teacher Access", time: "15 mins ago", type: "add" },
    { action: "User registered", detail: "Michael Johnson - Student", time: "1 hour ago", type: "add" },
    { action: "Access revoked", detail: "Sarah Lee - Removed access", time: "2 hours ago", type: "remove" },
    { action: "Report generated", detail: "Monthly user analytics", time: "3 hours ago", type: "update" },
];

const roleDistribution = [
    { name: "Students", count: 120, color: "bg-emerald-500", percentage: 77 },
    { name: "Advisers", count: 25, color: "bg-cyan-500", percentage: 16 },
    { name: "Admins", count: 11, color: "bg-slate-600", percentage: 7 },
];

export default function AdminDashboardPage() {
    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
        >
            {/* Welcome */}
            <motion.div variants={fadeInUp}>
                <AdminPageHeader
                    title="Welcome back, Admin!"
                    description="Here's the dashboard for the overall statistics of the college."
                />
            </motion.div>

            {/* Stats Grid */}
            <motion.div variants={fadeInUp} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, index) => {
                    const Icon = stat.icon;
                    const TrendIcon = stat.trend === "up" ? TrendingUp : stat.trend === "down" ? TrendingDown : Clock;
                    const trendColor = stat.trend === "up" ? "text-emerald-600" : stat.trend === "down" ? "text-red-600" : "text-slate-500";

                    return (
                        <motion.div
                            key={stat.title}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1 }}
                            whileHover={{ y: -4 }}
                        >
                            <Card className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                <CardContent className="p-5">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="text-sm text-muted-foreground">{stat.title}</p>
                                            <p className="text-3xl font-bold text-foreground mt-1">{stat.value}</p>
                                            <div className={`flex items-center gap-1 mt-2 ${trendColor}`}>
                                                <TrendIcon className="w-3 h-3" />
                                                <span className="text-xs font-medium">{stat.change} this week</span>
                                            </div>
                                        </div>
                                        <div className={`w-10 h-10 rounded-lg ${stat.bgColor} flex items-center justify-center`}>
                                            <Icon className={`w-5 h-5 ${stat.color}`} />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </motion.div>
                    );
                })}
            </motion.div>

            {/* Main Content Grid */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Role Distribution */}
                <motion.div variants={fadeInUp} className="lg:col-span-2">
                    <Card className="border-0 shadow-sm h-full">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">User Distribution by Role</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {roleDistribution.map((role, index) => (
                                    <motion.div
                                        key={role.name}
                                        initial={{ opacity: 0, x: -20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.2 + index * 0.1 }}
                                        className="flex items-center gap-4"
                                    >
                                        <div className={`w-3 h-12 rounded-full ${role.color}`} />
                                        <div className="flex-1">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-medium text-foreground">{role.name}</span>
                                                <div className="flex gap-4 text-sm">
                                                    <span className="text-muted-foreground">
                                                        <span className="font-semibold text-foreground">{role.count}</span> users
                                                    </span>
                                                    <span className="font-semibold text-foreground">
                                                        {role.percentage}%
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <motion.div
                                                    className={`h-full ${role.color} rounded-full`}
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${role.percentage}%` }}
                                                    transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                                                />
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>

                {/* Recent Activity */}
                <motion.div variants={fadeInUp}>
                    <Card className="border-0 shadow-sm h-full">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Recent Activity</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {recentActivity.map((activity, index) => (
                                    <motion.div
                                        key={index}
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.1 * index }}
                                        className="flex items-start gap-3"
                                    >
                                        <div
                                            className={`w-2 h-2 rounded-full mt-2 shrink-0 ${activity.type === "add"
                                                ? "bg-emerald-500"
                                                : activity.type === "remove"
                                                    ? "bg-red-500"
                                                    : "bg-cyan-500"
                                                }`}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground">{activity.action}</p>
                                            <p className="text-xs text-muted-foreground truncate">{activity.detail}</p>
                                            <p className="text-xs text-muted-foreground mt-1">{activity.time}</p>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            </div>

            {/* Quick Actions */}
            <motion.div variants={fadeInUp}>
                <Card className="border-0 shadow-sm bg-linear-to-br from-emerald-500/5 to-background">
                    <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold text-foreground">Quick Actions</h3>
                                <p className="text-sm text-muted-foreground">Common tasks you might want to perform</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                    <Badge className="cursor-pointer px-4 py-2 text-sm bg-emerald-600 text-white hover:bg-emerald-700">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add User
                                    </Badge>
                                </motion.div>
                                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                    <Badge variant="outline" className="cursor-pointer px-4 py-2 text-sm hover:bg-muted">
                                        <Users className="w-4 h-4 mr-2" />
                                        Manage Users
                                    </Badge>
                                </motion.div>
                                <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                                    <Badge variant="outline" className="cursor-pointer px-4 py-2 text-sm hover:bg-muted">
                                        <Lock className="w-4 h-4 mr-2" />
                                        Manage Access
                                    </Badge>
                                </motion.div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>
        </motion.div>
    );
}
