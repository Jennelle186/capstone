import * as React from "react";
import { useParams, useNavigate } from "react-router";
import { useAuth } from "@clerk/clerk-react";
import { ArrowLeft, ExternalLink, CheckCircle2, Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fetchWithClerkAuth } from "@/lib/api";
import type { ExtractionItemResponse } from "@/types/extraction";
import type { SubmissionDetail, DownloadUrlResponse } from "@/types/submission";

type FieldGroup = {
  title: string;
  fields: ExtractionItemResponse["fields"];
};

export default function ExtractionDetailPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const navigate = useNavigate();
  const { getToken } = useAuth();
  const getTokenRef = React.useRef(getToken);

  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const [loading, setLoading] = React.useState(true);
  const [fields, setFields] = React.useState<FieldGroup[]>([]);
  const [docInfo, setDocInfo] = React.useState<{
    fileName: string;
    docType: string;
    status: string;
    uploadDate: string;
  } | null>(null);
  const [error, setError] = React.useState(false);
  const [previewUrl, setPreviewUrl] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    if (!submissionId) return;
    let cancelled = false;

    const fetchData = async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;

        const [extRes, docsRes, urlRes] = await Promise.all([
          fetchWithClerkAuth(
            "/api/me/documents/extractions?status=classified,flagged,processing,submitted,in-review,verified",
            token,
          ),
          fetchWithClerkAuth("/api/me/documents", token),
          fetchWithClerkAuth(`/api/me/documents/${submissionId}/download-url`, token),
        ]);

        if (cancelled) return;

        if (urlRes.ok) {
          const urlData = (await urlRes.json()) as DownloadUrlResponse;
          if (!cancelled) setPreviewUrl(urlData.url);
        }

        if (extRes.ok) {
          const allExtractions = (await extRes.json()) as ExtractionItemResponse[];
          const activeItem = allExtractions.find((e) => e.submission_id === submissionId);
          if (activeItem) {
            const grouped = new Map<string, ExtractionItemResponse["fields"]>();
            for (const f of activeItem.fields) {
              const title = f.section_title ?? "Extracted Fields";
              if (!grouped.has(title)) grouped.set(title, []);
              grouped.get(title)!.push(f);
            }
            if (!cancelled) {
              setFields(
                Array.from(grouped.entries()).map(([title, flds]) => ({ title, fields: flds })),
              );
            }
          }
        }

        if (docsRes.ok) {
          const docs = (await docsRes.json()) as SubmissionDetail[];
          const doc = docs.find((d) => d.id === submissionId);
          if (doc && !cancelled) {
            const date = new Date(doc.created_at);
            setDocInfo({
              fileName: doc.original_filename,
              docType: doc.document_type_name ?? "Unclassified",
              status: doc.status,
              uploadDate: date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
            });
          }
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [submissionId]);

  const statusVariant = (status: string): "default" | "secondary" | "outline" => {
    const map: Record<string, "default" | "secondary" | "outline"> = {
      verified: "default",
      classified: "default",
      "in-review": "secondary",
      flagged: "secondary",
      submitted: "secondary",
      processing: "secondary",
      uploaded: "secondary",
    };
    return map[status] ?? "outline";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
        Loading extraction data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-slate-500 text-sm">Failed to load extraction data.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/student/dashboard")}>
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const handleDownload = () => {
    if (!previewUrl) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = docInfo?.fileName ?? "document";
    a.click();
    a.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  const totalFields = fields.reduce((s, g) => s + g.fields.length, 0);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate("/student/dashboard")}
        className="gap-1.5 text-slate-500 hover:text-slate-700 -ml-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Button>

      {/* Document info header */}
      {docInfo && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-semibold text-slate-900 truncate">
                  {docInfo.fileName}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <span>{docInfo.docType}</span>
                <span className="text-slate-300">&bull;</span>
                <span>Uploaded {docInfo.uploadDate}</span>
                <Badge variant={statusVariant(docInfo.status)}>
                  {docInfo.status}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {previewUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => window.open(previewUrl, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Document
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Extracted Fields</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {totalFields} field{totalFields !== 1 ? "s" : ""} extracted across {fields.length} section{fields.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-slate-500 hover:text-slate-700" onClick={handleDownload} disabled={!previewUrl}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-slate-500 hover:text-slate-700" onClick={handlePrint}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </Button>
          </div>
        </div>

        {/* Fields by section */}
        <div className="space-y-6">
          {fields.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">
              No extracted fields available for this document.
            </p>
          ) : (
            fields.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">
                  {group.title}
                </h3>
                <div className="gap-4 [column-count:1] lg:[column-count:2] space-y-4">
                  {group.fields.map((field) => (
                    <div
                      key={field.id}
                      className="break-inside-avoid p-4 border border-slate-100 rounded-xl bg-white shadow-sm dark:bg-slate-900 dark:border-slate-800"
                    >
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        {field.description || field.key}
                      </span>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {field.value || <em className="text-slate-300 dark:text-slate-700 font-normal">Empty</em>}
                        </span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
