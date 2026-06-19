import * as React from "react";
import { useAuth } from "@clerk/clerk-react";
import { GraduationCap, User, PlusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router";
import { fetchWithClerkAuth } from "@/lib/api";
import StatSummaryCards from "@/components/student/Dashboard/StatSummaryCards";
import AnnouncementBar from "@/components/student/Dashboard/AnnouncementBar";
import SubmissionsTable from "@/components/student/Dashboard/SubmissionsTable";
import DocumentDetailModal from "@/components/student/Dashboard/DocumentDetailModal";
import {
  placeholderSubmissions,
  type Submission,
  type SubmissionStatusType,
} from "@/components/student/Dashboard/types";
import type { SubmissionDetail } from "@/types/submission";

interface MeResponse {
  userId: string;
  firstName: string | null;
  lastName: string | null;
}

interface RequiredDocumentsData {
  school_year_id: string | null;
  school_year_name: string | null;
  classification: string | null;
}

function formatFileSize(bytes: string | null): string {
  if (!bytes) return "Unknown";
  const num = parseInt(bytes, 10);
  if (isNaN(num)) return "Unknown";
  if (num < 1024) return `${num} B`;
  const kb = num / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function mimeToLabel(mime: string | null): string {
  if (!mime) return "Unknown";
  if (mime.startsWith("image/")) return "Image";
  if (mime === "application/pdf") return "PDF";
  return mime;
}

function toSubmission(detail: SubmissionDetail): Submission {
  return {
    id: detail.id,
    documentName: detail.original_filename,
    documentType: detail.document_type_name ?? "Unclassified",
    uploadDate: formatDate(detail.created_at),
    status: detail.status as SubmissionStatusType,
    fileType: mimeToLabel(detail.mime_type),
    fileSize: formatFileSize(detail.file_size),
  };
}

export default function StudentDashboard() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const [firstName, setFirstName] = React.useState<string | null>(null);
  const [lastName, setLastName] = React.useState<string | null>(null);
  const [schoolYear, setSchoolYear] = React.useState<string | null>(null);
  const [classification, setClassification] = React.useState<string | null>(null);

  const [submissions, setSubmissions] = React.useState<Submission[]>(placeholderSubmissions);
  const [loadingDocs, setLoadingDocs] = React.useState(true);
  const [currentIndex, setCurrentIndex] = React.useState(-1);
  const [modalOpen, setModalOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let isMounted = true;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const [meRes, reqRes, docsRes] = await Promise.all([
          fetchWithClerkAuth("/api/me", token),
          fetchWithClerkAuth("/api/me/required-documents", token),
          fetchWithClerkAuth("/api/me/documents", token),
        ]);

        if (!meRes.ok || !reqRes.ok) return;
        if (!isMounted) return;

        const me = (await meRes.json()) as MeResponse;
        const req = (await reqRes.json()) as RequiredDocumentsData;

        setFirstName(me.firstName);
        setLastName(me.lastName);
        setSchoolYear(req.school_year_name);
        setClassification(req.classification);

        if (docsRes.ok) {
          const docs = (await docsRes.json()) as SubmissionDetail[];
          if (isMounted) {
            setSubmissions(docs.map(toSubmission));
            setLoadingDocs(false);
          }
        }
      } catch {
        // ignore
      } finally {
        if (isMounted) setLoadingDocs(false);
      }
    };

    void load();
    return () => { isMounted = false; };
  }, [getToken, isLoaded, isSignedIn]);

  const handleView = (submission: Submission) => {
    const idx = submissions.findIndex((s) => s.id === submission.id);
    if (idx >= 0) setCurrentIndex(idx);
    setModalOpen(true);
  };

  const handleIndexChange = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <main className="flex flex-1 flex-col gap-6">
      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <span className="text-lg font-medium text-slate-500">Welcome,</span>
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {firstName ? `${firstName} ${lastName ?? ""}` : "Student Dashboard"}
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {schoolYear && (
              <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 rounded-full border-0 gap-1 text-xs font-semibold">
                <GraduationCap className="h-3 w-3" />
                School Year: {schoolYear}
              </Badge>
            )}
            {classification && (
              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 rounded-full border-0 gap-1 text-xs font-semibold capitalize">
                <User className="h-3 w-3" />
                Classification: {classification}
              </Badge>
            )}
          </div>
        </div>
        <Link to="/student/upload">
          <Button className="bg-primary text-white hover:bg-primary/90 rounded-xl gap-2">
            <PlusCircle className="h-4 w-4 fill-current" />
            Upload New Document
          </Button>
        </Link>
      </div>

      {/* Stat Cards */}
      <StatSummaryCards submissions={submissions} />

      {/* Announcements */}
      <AnnouncementBar />

      {/* Submissions Table */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">Document Archive</h3>
          <p className="text-xs text-slate-500 mt-0.5">Review your historical uploads and AI-verified extractions.</p>
        </div>
        <div className="p-5">
          {loadingDocs ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              Loading documents...
            </div>
          ) : (
            <SubmissionsTable data={submissions} onView={handleView} />
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <DocumentDetailModal
        submissions={submissions}
        currentIndex={currentIndex}
        onIndexChange={handleIndexChange}
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setCurrentIndex(-1);
        }}
      />
    </main>
  );
}
