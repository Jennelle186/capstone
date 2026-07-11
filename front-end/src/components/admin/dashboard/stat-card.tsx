import { Link } from "react-router";
import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  title: string;
  value: string;
  delta: string;
  icon: LucideIcon;
  href?: string;
  timestamp?: string;
  borderClassName?: string;
  trend?: "up" | "down" | "neutral";
}

const trendColors: Record<string, string> = {
  up: "text-primary",
  down: "text-destructive",
  neutral: "text-muted-foreground",
};

export function StatCard({
  title,
  value,
  delta,
  icon: Icon,
  href,
  timestamp,
  borderClassName = "border-t-primary/20",
  trend = "up",
}: StatCardProps) {
  const Wrapper = href
    ? ({ children }: { children: React.ReactNode }) => (
        <Link to={href} className="block">
          {children}
        </Link>
      )
    : ({ children }: { children: React.ReactNode }) => <>{children}</>;

  return (
    <Wrapper>
      <Card
        className={cn(
          "shadow-sm transition-all border-t-2",
          borderClassName,
          href && "cursor-pointer hover:shadow-md"
        )}
      >
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground tracking-wide uppercase">
                {title}
              </p>
              <p className="text-3xl font-extrabold text-foreground tracking-tight">
                {value}
              </p>
              <div className={cn("flex items-center gap-1 text-xs font-semibold", trendColors[trend])}>
                {delta}
              </div>
              {timestamp && (
                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                  As of {timestamp}
                </p>
              )}
            </div>
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-4.5 h-4.5 text-primary/70" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Wrapper>
  );
}
