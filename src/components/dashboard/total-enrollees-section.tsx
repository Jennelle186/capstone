"use client";

import * as React from "react";

import {
  OptimizedAreaChart,
  type OptimizedAreaChartDataPoint,
} from "@/components/charts/optimized-area-chart";

type TotalEnrolleesSectionProps = {
  data: OptimizedAreaChartDataPoint[];
};

export default function TotalEnrolleesSection({ data }: TotalEnrolleesSectionProps) {
  const stableData = React.useMemo(() => data, [data]);

  return (
    <section className="w-full" aria-label="Total enrollees trend">
      <OptimizedAreaChart
        title="Total Enrollees"
        description="Enrollment trend for the selected period"
        data={stableData}
        defaultYear="2026"
        defaultMonth="02"
      />
    </section>
  );
}
