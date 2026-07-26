"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@clerk/clerk-react";
import { toast } from "sonner";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { fetchWithClerkAuth } from "@/lib/api";

interface ReportDefinition {
  slug: string;
  title: string;
  description: string;
  filename: string;
}

const REPORTS: ReportDefinition[] = [
  {
    slug: "students",
    title: "Student Report",
    description:
      "All students with document verification status per document type. Includes student number, department, and per-department counts. One sheet per school year.",
    filename: "student-report.xlsx",
  },
  {
    slug: "advisers",
    title: "Adviser Report",
    description:
      "All advisers and their programme assignments with per-department counts. One sheet per school year — active year first.",
    filename: "adviser-report.xlsx",
  },
  {
    slug: "document-requirements",
    title: "Document Requirements Report",
    description:
      "Document types, linked extraction schemas, schema versions, and status per school year. Summary shows structured-vs-classification-only counts.",
    filename: "document-requirements-report.xlsx",
  },
];

export default function ReportsPage() {
  const { getToken, isLoaded } = useAuth();
  const [downloading, setDownloading] = useState<string | null>(null);

  const handleDownload = useCallback(
    async (slug: string, filename: string) => {
      if (!isLoaded) return;
      const token = await getToken();
      if (!token) {
        toast.error("Authentication required. Please sign in again.");
        return;
      }

      setDownloading(slug);

      try {
        const response = await fetchWithClerkAuth(
          `/api/admin/reports/${slug}.xlsx`,
          token,
        );

        if (!response.ok) {
          const err = await response.json().catch(() => null);
          toast.error(err?.detail ?? `Failed to generate ${slug} report.`);
          return;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        const label = slug
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ");
        toast.success(`${label} report downloaded.`);
      } catch {
        toast.error("Something went wrong. Please try again.");
      } finally {
        setDownloading(null);
      }
    },
    [getToken, isLoaded],
  );

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Reports"
        description="Generate downloadable multi-sheet XLSX reports for students, advisers, and document requirements"
        titleClassName="text-3xl font-bold tracking-tight text-foreground"
        descriptionClassName="mt-2"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {REPORTS.map((report) => {
          const isDownloading = downloading === report.slug;

          return (
            <Card key={report.slug} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-base">{report.title}</CardTitle>
                    <CardDescription className="text-xs leading-relaxed">
                      {report.description}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button
                  onClick={() => handleDownload(report.slug, report.filename)}
                  disabled={isDownloading || !isLoaded}
                  className="w-full"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Generate XLSX
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
