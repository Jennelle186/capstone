"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OptimizedAreaChartDataPoint = {
  date: string;
  value: number;
};

type OptimizedAreaChartProps = {
  title: string;
  description: string;
  data: OptimizedAreaChartDataPoint[];
  defaultYear?: string;
  defaultMonth?: string;
};

const chartConfig = {
  value: {
    label: "Series",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const MAX_POINTS_PER_VIEWPORT_PIXEL = 8;
const LARGE_DATASET_THRESHOLD = 500;

// Renders a minimal static legend
const StaticLegend = React.memo(function StaticLegend() {
  return (
    <div className="pt-3 text-center text-xs text-muted-foreground">
      Total over selected period
    </div>
  );
});

// tooltip with preformatted labels and numeric values.
const TooltipContent = React.memo(function TooltipContent({
  active,
  payload,
  label,
  labelMap,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  labelMap: Map<string, string>;
}) {
  if (!active || !payload?.length || !label) {
    return null;
  }

  return (
    <div className="grid min-w-32 gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="font-medium">{labelMap.get(label) ?? label}</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">Value</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {Number(payload[0]?.value ?? 0).toLocaleString("en-US")}
        </span>
      </div>
    </div>
  );
});

// Reduces the number of rendered points by selecting one representative point per bucket.
function downsampleData(points: OptimizedAreaChartDataPoint[], maxPoints: number) {
  if (maxPoints <= 0 || points.length <= maxPoints) {
    return points;
  }

  const bucketSize = Math.ceil(points.length / maxPoints);
  const reduced: OptimizedAreaChartDataPoint[] = [];

  for (let index = 0; index < points.length; index += bucketSize) {
    const bucket = points.slice(index, index + bucketSize);
    const midpoint = bucket[Math.floor(bucket.length / 2)];

    if (midpoint) {
      reduced.push(midpoint);
    }
  }

  const lastPoint = points[points.length - 1];
  if (lastPoint && reduced[reduced.length - 1]?.date !== lastPoint.date) {
    reduced.push(lastPoint);
  }

  return reduced;
}

// Formats raw ISO date strings for user-facing tooltip and axis label display.
function formatLabel(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Converts a date string into a stable year-month key (YYYY-MM) for grouping and filtering.
function toMonthKey(dateString: string) {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

// Converts a two-digit month value to a localized month name for the month selector.
function toMonthName(month: string) {
  const date = new Date(2000, Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "long" });
}

// Main chart component that manages selector state, filtering, and rendering optimizations.
function OptimizedAreaChartComponent({
  title,
  description,
  data,
  defaultYear,
  defaultMonth,
}: OptimizedAreaChartProps) {
  const [viewportWidth, setViewportWidth] = React.useState(960);
  const chartHostRef = React.useRef<HTMLDivElement | null>(null);

  //normalization and drop invalid rows and ensure chronological ordering.
  const normalizedData = React.useMemo(
    () =>
      [...data]
        .filter((item) => Number.isFinite(new Date(item.date).getTime()) && Number.isFinite(item.value))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [data]
  );

  const monthYearOptions = React.useMemo(() => {
    const months = new Set<string>();
    for (const item of normalizedData) {
      months.add(toMonthKey(item.date));
    }
    return Array.from(months).sort((a, b) => a.localeCompare(b));
  }, [normalizedData]);

  const yearOptions = React.useMemo(() => {
    const years = new Set<string>();
    for (const monthYear of monthYearOptions) {
      years.add(monthYear.slice(0, 4));
    }
    return Array.from(years).sort((a, b) => a.localeCompare(b));
  }, [monthYearOptions]);

  const [selectedYear, setSelectedYear] = React.useState<string>(defaultYear ?? "");
  const [selectedMonth, setSelectedMonth] = React.useState<string>(defaultMonth ?? "");

  // Month options are constrained by the selected year
  const monthOptionsForYear = React.useMemo(() => {
    if (!selectedYear) {
      return [];
    }
    const months = new Set<string>();
    for (const monthYear of monthYearOptions) {
      if (monthYear.startsWith(`${selectedYear}-`)) {
        months.add(monthYear.slice(5, 7));
      }
    }
    return Array.from(months).sort((a, b) => a.localeCompare(b));
  }, [monthYearOptions, selectedYear]);

  React.useEffect(() => {
    if (!yearOptions.length) {
      return;
    }

    if (selectedYear && yearOptions.includes(selectedYear)) {
      return;
    }

    setSelectedYear(defaultYear && yearOptions.includes(defaultYear) ? defaultYear : yearOptions[yearOptions.length - 1]);
  }, [defaultYear, selectedYear, yearOptions]);

  React.useEffect(() => {
    if (!monthOptionsForYear.length) {
      return;
    }

    if (selectedMonth && monthOptionsForYear.includes(selectedMonth)) {
      return;
    }

    setSelectedMonth(
      defaultMonth && monthOptionsForYear.includes(defaultMonth)
        ? defaultMonth
        : monthOptionsForYear[monthOptionsForYear.length - 1]
    );
  }, [defaultMonth, monthOptionsForYear, selectedMonth]);

  React.useEffect(() => {
    const node = chartHostRef.current;
    if (!node) {
      return;
    }

    // Track chart container width to adapt the visible point budget to viewport size.
    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 960;
      setViewportWidth(Math.max(320, nextWidth));
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const filteredData = React.useMemo(() => {
    if (!normalizedData.length || !selectedYear || !selectedMonth) {
      return [];
    }

    // Filter at source before rendering to reduce chart work.
    const targetMonthYear = `${selectedYear}-${selectedMonth}`;
    return normalizedData.filter((item) => toMonthKey(item.date) === targetMonthYear);
  }, [normalizedData, selectedMonth, selectedYear]);

  const visibleData = React.useMemo(() => {
    // Window point density by viewport width to avoid over-plotting and expensive paints.
    const targetPoints = Math.floor(viewportWidth / MAX_POINTS_PER_VIEWPORT_PIXEL);
    return downsampleData(filteredData, targetPoints);
  }, [filteredData, viewportWidth]);

  const labelMap = React.useMemo(() => {
    const labels = new Map<string, string>();
    for (const point of visibleData) {
      labels.set(point.date, formatLabel(point.date));
    }
    return labels;
  }, [visibleData]);

  const showGradient = visibleData.length < LARGE_DATASET_THRESHOLD;

  // Updates selected year and triggers recomputation of month options + filtered dataset.
  const handleYearChange = React.useCallback((value: string) => {
    setSelectedYear(value);
  }, []);

  // Updates selected month and triggers recomputation of the filtered dataset.
  const handleMonthChange = React.useCallback((value: string) => {
    setSelectedMonth(value);
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-4 border-b py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={selectedMonth} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-[160px]" aria-label="Select month">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {monthOptionsForYear.map((month) => (
                <SelectItem key={month} value={month}>
                  {toMonthName(month)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[120px]" aria-label="Select year">
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <div ref={chartHostRef} className="h-[320px] w-full">
          <ChartContainer config={chartConfig} className="h-full w-full">
            <AreaChart data={visibleData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              {showGradient && (
                <defs>
                  <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
              )}
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                minTickGap={28}
                tickMargin={8}
                tickFormatter={(value: string) => labelMap.get(value)?.replace(/, \d{4}$/, "") ?? value}
              />
              <ChartTooltip
                cursor={false}
                content={<TooltipContent labelMap={labelMap} />}
                isAnimationActive={false}
              />
              <Area
                type={visibleData.length > LARGE_DATASET_THRESHOLD ? "monotone" : "natural"}
                dataKey="value"
                stroke="var(--color-value)"
                fill={showGradient ? "url(#fillValue)" : "var(--color-value)"}
                fillOpacity={showGradient ? 1 : 0.14}
                isAnimationActive={false}
                strokeWidth={2}
              />
              <ChartLegend content={<StaticLegend />} />
            </AreaChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export const OptimizedAreaChart = React.memo(OptimizedAreaChartComponent);
