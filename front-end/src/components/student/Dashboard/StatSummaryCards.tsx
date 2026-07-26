import * as React from "react";
import { FileText, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import type { Submission } from "./types";

interface Props {
  submissions: Submission[];
}

export default function StatSummaryCards({ submissions }: Props) {
  const stats = React.useMemo(() => {
    let total = 0;
    let verified = 0;
    let inReview = 0;
    let flagged = 0;

    submissions.forEach((doc) => {
      if ((doc.status as string) === "uploading" || (doc.status as string) === "failed") return;

      total++;

      switch (doc.status) {
        case "verified":
        case "submitted":
        case "classified":
          verified++;
          break;
        case "in-review":
        case "processing":
          inReview++;
          break;
        case "flagged":
          flagged++;
          break;
      }
    });

    return { total, verified, inReview, flagged };
  }, [submissions]);

  const cards = [
    { label: "Total Uploads", value: stats.total, icon: FileText, color: "text-blue-600", bg: "bg-blue-100" },
    { label: "Verified", value: stats.verified, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-100" },
    { label: "In Review", value: stats.inReview, icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
    { label: "Issues Flagged", value: stats.flagged, icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-100" },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.label}
            className="relative bg-white border border-slate-200 p-5 rounded-2xl shadow-sm group transition-all duration-300 hover:shadow-md hover:-translate-y-0.5"
          >
            <span
              className={`absolute top-4 right-4 ${card.bg} ${card.color} p-2 rounded-full transition-transform group-hover:rotate-12`}
            >
              <Icon className="h-5 w-5" />
            </span>
            <p className="text-4xl font-bold text-slate-900">{card.value}</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mt-1">
              {card.label}
            </p>
          </div>
        );
      })}
    </section>
  );
}
