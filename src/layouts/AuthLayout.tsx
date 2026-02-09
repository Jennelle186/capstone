import type { ReactNode } from "react";
import { motion } from "motion/react";
import { fadeUp, stagger } from "@/lib/motion";

interface AuthLayoutProps {
    children: ReactNode;
    title?: string;
    description?: string;
}

export default function AuthLayout({ children, title, description }: AuthLayoutProps) {
    return (
        <div className="grid min-h-svh lg:grid-cols-2">
            <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-slate-200 bg-slate-50 text-slate-900 p-10">
                <motion.div
                    className="pointer-events-none absolute -top-24 -right-20 h-64 w-64 rounded-full bg-emerald-200/40 blur-3xl"
                    animate={{ x: [0, -10, 0], y: [0, 12, 0] }}
                    transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-sky-200/40 blur-3xl"
                    animate={{ x: [0, 12, 0], y: [0, -10, 0] }}
                    transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,_rgba(148,163,184,0.08)_0%,_transparent_45%,_rgba(226,232,240,0.45)_100%)]"
                    animate={{ opacity: [0.2, 0.35, 0.2] }}
                    transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,_rgba(15,23,42,0.06),_transparent_45%)]" />

                <motion.div
                    variants={stagger}
                    initial="hidden"
                    animate="visible"
                    className="relative"
                >
                    <motion.p
                        variants={fadeUp}
                        className="text-xs uppercase tracking-[0.2em] text-slate-500"
                    >
                        College of Computing Studies - Western Mindanao State University
                    </motion.p>
                    <motion.h2 variants={fadeUp} className="mt-4 text-2xl font-semibold text-slate-900">
                        CCS Enrollment Document System
                    </motion.h2>
                    <motion.p variants={fadeUp} className="mt-3 text-sm text-slate-600">
                        Official entry point for enrollment documentation with OCR-assisted
                        capture, academic verification, and secure institutional records.
                    </motion.p>
                </motion.div>

                <motion.div
                    variants={stagger}
                    initial="hidden"
                    animate="visible"
                    className="relative mt-10"
                >
                    <motion.p variants={fadeUp} className="text-sm font-semibold text-slate-900">
                        System Overview
                    </motion.p>
                    <motion.ul variants={stagger} className="mt-4 space-y-3 text-sm text-slate-600">
                        <motion.li variants={fadeUp}>
                            OCR-enhanced intake to reduce manual transcription
                        </motion.li>
                        <motion.li variants={fadeUp}>
                            Verification aligned with CCS academic requirements
                        </motion.li>
                        <motion.li variants={fadeUp}>
                            Centralized, auditable records for enrollment compliance
                        </motion.li>
                    </motion.ul>
                </motion.div>

                <motion.div
                    variants={stagger}
                    initial="hidden"
                    animate="visible"
                    className="relative mt-10 flex flex-wrap gap-2 text-xs"
                >
                    <motion.span variants={fadeUp} className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-600">
                        Secure Access
                    </motion.span>
                    <motion.span variants={fadeUp} className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-slate-600">
                        OCR Verified
                    </motion.span>
                    <motion.span variants={fadeUp} className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                        Institutional Record
                    </motion.span>
                </motion.div>
            </aside>
            <div className="flex flex-col gap-4 p-6 md:p-10">
                <div className="flex flex-1 items-center justify-center">
                    <div className="w-full max-w-xs">
                        {(title || description) && (
                            <div className="mb-6">
                                {title && (
                                    <h1 className="text-2xl font-bold tracking-tight">
                                        {title}
                                    </h1>
                                )}
                                {description && (
                                    <p className="text-muted-foreground mt-2 text-sm">
                                        {description}
                                    </p>
                                )}
                            </div>
                        )}
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
