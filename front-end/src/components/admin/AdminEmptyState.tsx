import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AdminEmptyStateProps {
    icon?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    action?: ReactNode;
    className?: string;
}

export default function AdminEmptyState({
    icon,
    title,
    description,
    action,
    className,
}: AdminEmptyStateProps) {
    return (
        <div className={cn("rounded-lg border border-dashed p-8 text-center", className)}>
            {icon ? <div className="mb-4 flex justify-center">{icon}</div> : null}
            <h3 className="text-lg font-medium text-foreground">{title}</h3>
            {description ? <p className="text-muted-foreground">{description}</p> : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    );
}
