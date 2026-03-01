import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type MetricCardTone = "neutral" | "attention" | "positive";

type MetricCardProps = {
  title: string;
  value: string;
  indicatorText: string;
  indicatorIcon?: LucideIcon;
  tone?: MetricCardTone;
};

const toneClassMap: Record<MetricCardTone, string> = {
  neutral: "bg-background",
  attention: "bg-muted/40",
  positive: "bg-accent/35",
};

export default function MetricCard({
  title,
  value,
  indicatorText,
  indicatorIcon: IndicatorIcon,
  tone = "neutral",
}: MetricCardProps) {
  return (
    <Card className={`rounded-xl border border-border shadow-sm ${toneClassMap[tone]}`}>
      <CardHeader className="pb-3">
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {IndicatorIcon && <IndicatorIcon className="size-3.5" aria-hidden="true" />}
          <span>{indicatorText}</span>
        </div>
      </CardContent>
    </Card>
  );
}

export type { MetricCardProps, MetricCardTone };
