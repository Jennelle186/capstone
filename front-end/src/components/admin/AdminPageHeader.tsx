import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface AdminPageHeaderProps {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
    titleClassName?: string;
    descriptionClassName?: string;
}

export default function AdminPageHeader({
    title,
    description,
    actions,
    className,
    titleClassName,
    descriptionClassName,
}: AdminPageHeaderProps) {
    return (
        <div
            className={cn(
                "flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
                className,
            )}
        >
            <div>
                <h2 className={cn("text-2xl font-bold text-foreground", titleClassName)}>{title}</h2>
                {description ? (
                    <p className={cn("text-muted-foreground", descriptionClassName)}>{description}</p>
                ) : null}
            </div>
            {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
    );
}
