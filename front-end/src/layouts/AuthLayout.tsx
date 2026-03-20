import type { ReactNode } from "react";
import { motion, type Variants } from "framer-motion";
import { Link } from "react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, FileText, Shield } from "lucide-react";

interface AuthLayoutProps {
    children: ReactNode;
    title?: string;
    description?: string;
}

const easeOut = [0.16, 1, 0.3, 1] as const;
const easeInOut = [0.65, 0, 0.35, 1] as const;

const fadeInUp: Variants = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: easeOut } },
};

const stagger: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};

export default function AuthLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <div className="grid min-h-svh lg:grid-cols-2 bg-background">
            {/* Left (Brand / Context) */}
            <motion.aside
                initial="hidden"
                animate="visible"
                variants={stagger}
                className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border px-10 py-12"
            >
                <motion.div
                    className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-primary/5 to-background"
                    variants={fadeInUp}
                />
                <motion.div
                    className="pointer-events-none absolute top-20 right-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.25, 0.45, 0.25] }}
                    transition={{ duration: 8, repeat: Infinity, ease: easeInOut }}
                />
                <motion.div
                    className="pointer-events-none absolute bottom-20 left-10 h-96 w-96 rounded-full bg-primary/5 blur-3xl"
                    animate={{ scale: [1.2, 1, 1.2], opacity: [0.2, 0.35, 0.2] }}
                    transition={{ duration: 10, repeat: Infinity, ease: easeInOut }}
                />

                <div className="relative">
                    <motion.div variants={fadeInUp} className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-xl bg-white border border-border p-2">
                            <img
                                src="/ccs-logo.jpg"
                                alt="CCS logo"
                                className="h-full w-full object-contain"
                            />
                        </div>
                        <div>
                            <div className="font-bold text-lg text-foreground">CCS • WMSU</div>
                            <div className="text-sm text-muted-foreground">Enrollment Document Portal</div>
                        </div>
                    </motion.div>

                    <motion.div variants={fadeInUp} className="mt-8">
                        <Badge variant="outline" className="mb-4">
                            College of Computing Studies
                        </Badge>
                        <h2 className="text-3xl font-bold tracking-tight text-foreground">
                            Secure access for students and staff
                        </h2>
                        <p className="mt-3 text-muted-foreground max-w-md">
                            Sign in to submit enrollment requirements, track verification status, and keep
                            CCS records organized for Western Mindanao State University.
                        </p>
                    </motion.div>

                    <motion.ul variants={stagger} className="mt-10 space-y-4 max-w-md">
                        {[
                            { icon: FileText, label: "Upload enrollment documents in one place" },
                            { icon: CheckCircle, label: "Get clear status updates during review" },
                            { icon: Shield, label: "Protected, role-based access to submissions" },
                        ].map((item) => (
                            <motion.li
                                key={item.label}
                                variants={fadeInUp}
                                className="flex items-start gap-3 text-muted-foreground"
                            >
                                <item.icon className="mt-0.5 h-5 w-5 text-primary" />
                                <span>{item.label}</span>
                            </motion.li>
                        ))}
                    </motion.ul>
                </div>

                <motion.div variants={fadeInUp} className="relative">
                    <Card className="border border-border bg-background/70 backdrop-blur-sm shadow-lg">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Quick tips</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <p>Keep scanned documents clear and readable.</p>
                            <p>Check notifications for correction requests.</p>
                        </CardContent>
                    </Card>
                </motion.div>
            </motion.aside>

            {/* Right (Form) */}
            <div className="relative flex flex-col p-6 md:p-10">
                <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background lg:hidden" />

                <div className="flex flex-1 items-center justify-center">
                    <motion.div
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, ease: easeOut }}
                        className="w-full max-w-md"
                    >
                        <div className="mb-6 flex items-center justify-between gap-3">
                            <Button asChild variant="ghost" size="sm">
                                <Link to="/">Back to Home</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                                <Link to="/terms">Terms</Link>
                            </Button>
                        </div>

                        <Card className="border border-border shadow-xl bg-background/90 backdrop-blur-sm">
                            {(title || description) && (
                                <CardHeader>
                                    {title && <CardTitle className="text-2xl">{title}</CardTitle>}
                                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                                </CardHeader>
                            )}
                            <CardContent className={title || description ? "" : "pt-6"}>{children}</CardContent>
                        </Card>
                    </motion.div>
                </div>
            </div>
        </div>
    );
}
