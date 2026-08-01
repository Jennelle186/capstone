import * as React from "react";
import { useAuth } from "@clerk/clerk-react";
import { GraduationCap, User, PlusCircle, AlertTriangle, Check, Loader2, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  student_number: string | null;
  program_id: string | null;
}

interface RequiredDocumentsData {
  school_year_id: string | null;
  school_year_name: string | null;
  school_year_status: string | null;
  classification: string | null;
}

interface DepartmentOption {
  id: string;
  code: string;
  name: string;
}

interface AdviserInfo {
  adviser_name: string | null;
  adviser_email: string | null;
  department_code: string | null;
  department_name: string | null;
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
  const [schoolYearStatus, setSchoolYearStatus] = React.useState<string | null>(null);
  const [studentNumber, setStudentNumber] = React.useState<string | null>(null);
  const [programId, setProgramId] = React.useState<string | null>(null);
  const [departments, setDepartments] = React.useState<DepartmentOption[]>([]);

  const [submissions, setSubmissions] = React.useState<Submission[]>(placeholderSubmissions);
  const [loadingDocs, setLoadingDocs] = React.useState(true);
  const [currentIndex, setCurrentIndex] = React.useState(-1);
  const [modalOpen, setModalOpen] = React.useState(false);

  const [adviserName, setAdviserName] = React.useState<string | null>(null);
  const [adviserEmail, setAdviserEmail] = React.useState<string | null>(null);

  const [pendingProgramId, setPendingProgramId] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [dialogAdviser, setDialogAdviser] = React.useState<AdviserInfo | null>(null);
  const [loadingAdviser, setLoadingAdviser] = React.useState(false);
  const [savingProgram, setSavingProgram] = React.useState(false);

  React.useEffect(() => {
    if (!isLoaded || !isSignedIn) return;

    let isMounted = true;
    const load = async () => {
      try {
        const token = await getToken();
        if (!token) return;

        const [meRes, reqRes, docsRes, deptRes] = await Promise.all([
          fetchWithClerkAuth("/api/me", token),
          fetchWithClerkAuth("/api/me/required-documents", token),
          fetchWithClerkAuth("/api/me/documents", token),
          fetchWithClerkAuth("/api/me/departments", token),
        ]);

        if (!meRes.ok || !reqRes.ok) return;
        if (!isMounted) return;

        const me = (await meRes.json()) as MeResponse;
        const req = (await reqRes.json()) as RequiredDocumentsData;

        setFirstName(me.firstName);
        setLastName(me.lastName);
        setStudentNumber(me.student_number);
        setSchoolYear(req.school_year_name);
        setSchoolYearStatus(req.school_year_status);
        setProgramId(me.program_id);

        if (me.program_id) {
          const adviserRes = await fetchWithClerkAuth("/api/me/adviser", token);
          if (adviserRes.ok) {
            const adviserData = (await adviserRes.json()) as AdviserInfo | null;
            if (adviserData?.adviser_name) {
              setAdviserName(adviserData.adviser_name);
              setAdviserEmail(adviserData.adviser_email);
            }
          }
        }

        if (deptRes.ok) {
          const depts = (await deptRes.json()) as DepartmentOption[];
          if (isMounted) setDepartments(depts);
        }

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

  const handleProgramSelect = async (value: string) => {
    setPendingProgramId(value);
    setLoadingAdviser(true);
    setDialogOpen(true);

    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetchWithClerkAuth("/api/me/adviser", token);
      if (res.ok) {
        const data = (await res.json()) as AdviserInfo | null;
        setDialogAdviser(data);
      } else {
        setDialogAdviser(null);
      }
    } catch {
      setDialogAdviser(null);
    } finally {
      setLoadingAdviser(false);
    }
  };

  const handleConfirmProgram = async () => {
    if (!pendingProgramId) return;
    setSavingProgram(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetchWithClerkAuth("/api/me/program", token, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program_id: pendingProgramId }),
      });
      if (res.ok) {
        setProgramId(pendingProgramId);
        const adviserRes = await fetchWithClerkAuth("/api/me/adviser", token);
        if (adviserRes.ok) {
          const adviserData = (await adviserRes.json()) as AdviserInfo | null;
          if (adviserData?.adviser_name) {
            setAdviserName(adviserData.adviser_name);
            setAdviserEmail(adviserData.adviser_email);
          }
        }
      }
    } catch {
      // ignore
    } finally {
      setSavingProgram(false);
      setDialogOpen(false);
      setPendingProgramId(null);
    }
  };

  const selectedDept = departments.find((d) => d.id === programId);
  const pendingDept = departments.find((d) => d.id === pendingProgramId);

  const handleView = (submission: Submission) => {
    const idx = submissions.findIndex((s) => s.id === submission.id);
    if (idx >= 0) setCurrentIndex(idx);
    setModalOpen(true);
  };

  const handleIndexChange = (index: number) => {
    setCurrentIndex(index);
  };

  const isSchoolYearClosed = schoolYearStatus?.toLowerCase() === "closed";

  return (
    <main className="flex flex-1 flex-col gap-6">
      {/* Archived School Year Banner */}
      {isSchoolYearClosed && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm font-medium text-red-800">
            The {schoolYear ?? "current"} school year is closed. Your documents are archived and read-only.
          </div>
        </div>
      )}

      {/* Program Selection Warning */}
      {!programId && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 px-5 py-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="flex flex-1 flex-col gap-3">
            <p className="text-sm font-medium text-red-800">
              Please choose which program you belong to, or else your documents will not be verified.
            </p>
            <Select onValueChange={handleProgramSelect} disabled={loadingDocs}>
              <SelectTrigger className="w-full max-w-xs bg-white border-red-300 focus:border-red-500 focus:ring-red-500">
                <SelectValue placeholder="Select your program..." />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.code} — {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={(open) => { if (!open && !savingProgram) { setDialogOpen(false); setPendingProgramId(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your program</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  By selecting <strong>{pendingDept?.code} — {pendingDept?.name}</strong>, you confirm
                  you are enrolled in this program.
                </p>

                {loadingAdviser && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Checking adviser information...
                  </div>
                )}

                {!loadingAdviser && dialogAdviser?.adviser_name && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
                    <p className="font-medium text-blue-900">Your assigned adviser</p>
                    <p className="text-blue-700 mt-1">{dialogAdviser.adviser_name}</p>
                    <p className="text-blue-600 text-xs">{dialogAdviser.adviser_email}</p>
                    <p className="text-blue-700 mt-1 text-xs">
                      Your documents will be verified by this adviser.
                    </p>
                  </div>
                )}

                {!loadingAdviser && dialogAdviser && !dialogAdviser.adviser_name && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                    <p className="font-medium text-amber-900">No adviser assigned yet</p>
                    <p className="text-amber-700 mt-1">
                      There is currently no adviser assigned to this department for this school year.
                      You may still select this program, but please contact the administrator if you
                      need an adviser.
                    </p>
                  </div>
                )}

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <p className="font-medium text-amber-900">This action is irreversible</p>
                  <p className="text-amber-700 mt-1">
                    You will not be able to change your program later. Contact your adviser
                    if you need to make changes.
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={savingProgram}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmProgram} disabled={savingProgram || loadingAdviser}>
              {savingProgram ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            {studentNumber && (
              <Badge className="bg-slate-100 text-slate-700 hover:bg-slate-100 rounded-full border-0 gap-1 text-xs font-semibold">
                <IdCard className="h-3 w-3" />
                ID: {studentNumber}
              </Badge>
            )}
            {selectedDept && (
              <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 rounded-full border-0 gap-1 text-xs font-semibold">
                <Check className="h-3 w-3" />
                Program: {selectedDept.code}
              </Badge>
            )}
            {adviserName && (
              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 rounded-full border-0 gap-1 text-xs font-semibold max-w-full" title={adviserEmail ?? undefined}>
                <User className="h-3 w-3 shrink-0" />
                <span className="truncate">Adviser: {adviserName}</span>
              </Badge>
            )}
          </div>
        </div>
        {!isSchoolYearClosed && (
          <Link to="/student/upload">
            <Button className="bg-primary text-white hover:bg-primary/90 rounded-xl gap-2">
              <PlusCircle className="h-4 w-4 fill-current" />
              Upload New Document
            </Button>
          </Link>
        )}
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
