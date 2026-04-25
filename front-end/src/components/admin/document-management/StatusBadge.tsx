import { Archive, CheckCircle2, CircleAlert, Layers3, Sparkles } from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusBadgeKind = "active" | "archived" | "total" | "configured" | "incomplete";

interface StatusBadgeProps {
    kind: StatusBadgeKind;
    count?: number;
    label?: string;
    className?: string;
}

const STATUS_STYLES: Record<StatusBadgeKind, { icon: ComponentType<{ className?: string }>; className: string; label: string }> = {
    active: {
        icon: CheckCircle2,
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        label: "Active",
    },
    archived: {
        icon: Archive,
        className: "border-slate-200 bg-slate-100 text-slate-700",
        label: "Archived",
    },
    total: {
        icon: Layers3,
        className: "border-blue-200 bg-blue-50 text-blue-700",
        label: "Total",
    },
    configured: {
        icon: Sparkles,
        className: "border-cyan-200 bg-cyan-50 text-cyan-700",
        label: "Configured",
    },
    incomplete: {
        icon: CircleAlert,
        className: "border-amber-200 bg-amber-50 text-amber-700",
        label: "Incomplete",
    },
};

export default function StatusBadge({ kind, count, label, className }: StatusBadgeProps) {
    const config = STATUS_STYLES[kind];
    const Icon = config.icon;
    const resolvedLabel = label ?? config.label;

    return (
        <Badge variant="outline" className={cn("gap-1", config.className, className)}>
            <Icon className="h-3.5 w-3.5" />
            {typeof count === "number" ? <span className="font-semibold tabular-nums">{count}</span> : null}
            <span>{resolvedLabel}</span>
        </Badge>
    );
}
