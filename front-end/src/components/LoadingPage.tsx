import { motion } from "framer-motion";
import { Shield, FileText, CheckCircle } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

const easeOut = [0.16, 1, 0.3, 1] as const;

export default function LoadingPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2 bg-background">
      {/* Brand / context column to mirror AuthLayout */}
      <motion.aside
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: easeOut }}
        className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-border px-10 py-12"
      >
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary/10 via-primary/5 to-background" />
        <div className="pointer-events-none absolute top-16 right-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute bottom-16 left-6 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />

        <div className="relative space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-white border border-border p-2 shadow-sm">
              <img src="/ccs-logo.jpg" alt="CCS logo" className="h-full w-full object-contain" />
            </div>
            <div>
              <div className="font-bold text-lg text-foreground">CCS • WMSU</div>
              <div className="text-sm text-muted-foreground">Enrollment Document Portal</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="h-6 w-64 rounded-md bg-primary/10" />
            <div className="h-4 w-80 rounded-md bg-muted/70" />
            <div className="h-4 w-72 rounded-md bg-muted/60" />
          </div>

          <ul className="space-y-3 text-muted-foreground">
            {[
              { icon: FileText, label: "Preparing your secure session…" },
              { icon: CheckCircle, label: "Verifying account details…" },
              { icon: Shield, label: "Keeping your data protected." },
            ].map((item) => (
              <li key={item.label} className="flex items-start gap-3">
                <item.icon className="mt-0.5 h-5 w-5 text-primary" />
                <span className="h-4 w-56 rounded-md bg-muted/60" aria-hidden />
                <span className="sr-only">{item.label}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative mt-8">
          <div className="h-24 w-full rounded-2xl border border-border bg-background/70 backdrop-blur-sm shadow-lg" />
        </div>
      </motion.aside>

      {/* Spinner column */}
      <div className="relative flex flex-col p-6 md:p-10">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/5 via-background to-background lg:hidden" />
        <div className="flex flex-1 items-center justify-center">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: easeOut }}
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

            <div className="rounded-2xl border border-border bg-background/90 p-10 shadow-xl backdrop-blur-sm flex flex-col items-center gap-4">
              <div
                className="h-12 w-12 animate-spin rounded-full border-4 border-border/60 border-t-primary"
                aria-label="Loading"
              />
              <div className="space-y-1 text-center">
                <p className="text-base font-semibold text-foreground">Loading, please wait…</p>
                <p className="text-sm text-muted-foreground">
                  We’re securing your session and preparing your dashboard.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
