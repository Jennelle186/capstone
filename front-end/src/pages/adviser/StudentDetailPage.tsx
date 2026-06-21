import { useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Eye,
  Mail,
  Calendar,
} from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import DataTable from "@/components/common/data-table/DataTable";
import PageHeader from "@/components/adviser/ui/PageHeader";
import SubmissionStatusBadge from "@/components/adviser/ui/SubmissionStatusBadge";
import { useStudentDetail } from "@/hooks/useStudentDetail";
import type { AdviserSubmissionStatus } from "@/types/adviser-dashboard";
import {
  CLASSIFICATION_LABELS,
  CLASSIFICATION_BADGE_CLASSES,
} from "@/types/adviser-students";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

interface TableSubmission {
  id: string;
  student_id: string;
  student_name: string;
  document_type: string;
  status: string;
  submitted_at: string;
}

export default function StudentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { student, submissions, loading, error } = useStudentDetail(id);

  const tableData: TableSubmission[] = useMemo(
    () =>
      submissions.map((sub) => ({
        id: sub.id,
        student_id: student?.id ?? sub.id,
        student_name: student?.name ?? "Unknown",
        document_type: sub.document_type ?? "Unclassified",
        status: sub.status,
        submitted_at: new Date(sub.submitted_at).toLocaleDateString("en-US", {
          year: "numeric", month: "short", day: "numeric",
        }),
      })),
    [submissions, student],
  );

  const columns: ColumnDef<TableSubmission>[] = useMemo(
    () => [
      {
        accessorKey: "document_type",
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Document Type
          </span>
        ),
        cell: ({ row }) => (
          <span className="text-sm font-medium text-slate-900">
            {row.getValue("document_type")}
          </span>
        ),
      },
      {
        accessorKey: "submitted_at",
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Submitted
          </span>
        ),
        cell: ({ row }) => (
          <span className="text-sm text-slate-500">
            {row.getValue("submitted_at")}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: () => (
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            Status
          </span>
        ),
        cell: ({ row }) => (
          <SubmissionStatusBadge status={row.getValue("status") as AdviserSubmissionStatus} />
        ),
      },
      {
        id: "actions",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              size="sm"
              className="rounded-full bg-primary px-4 text-xs font-semibold text-white shadow-sm hover:bg-primary/90"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/adviser/students/${student?.id}/review/${row.original.id}`);
              }}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              Review
            </Button>
          </div>
        ),
      },
    ],
    [tableData],
  );

  if (loading) {
    return (
      <div className="space-y-6">
        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <PageHeader
            title="Loading..."
            backTo="/adviser/students"
            backLabel="Back to Advisees"
          />
        </motion.div>

        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center gap-5">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="space-y-3 flex-1">
                  <Skeleton className="h-6 w-64" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-80" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <Skeleton className="h-64 w-full rounded-2xl" />
        </motion.div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="space-y-6">
        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <PageHeader
            title="Student Not Found"
            backTo="/adviser/students"
            backLabel="Back to Advisees"
          />
        </motion.div>

        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-12 text-center">
              <AlertTriangle className="h-12 w-12 text-rose-400 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">Failed to Load Student</h3>
              <p className="text-sm text-slate-500">{error ?? "Student not found"}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                Try Again
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <PageHeader
          title={student.name}
          subtitle={`S.Y. ${student.school_year}`}
          backTo="/adviser/students"
          backLabel="Back to Advisees"
        />
      </motion.div>

      {/* Student Profile Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <Card className="border-slate-200 shadow-sm">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex items-start gap-5">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {student.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-slate-900">{student.name}</h2>
                    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${CLASSIFICATION_BADGE_CLASSES[student.classification]}`}>
                      {CLASSIFICATION_LABELS[student.classification]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                      {student.program}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">
                      {student.student_number}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {student.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      S.Y. {student.school_year}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CET Score</p>
                  <p className="text-sm font-extrabold text-slate-800">{student.cet_score ?? "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GPA</p>
                  <p className="text-sm font-extrabold text-slate-800">{student.gpa ? student.gpa.toFixed(2) : "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">High School</p>
                  <p className="text-xs font-semibold text-slate-700">{student.high_school ?? "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Provincial Address</p>
                  <p className="text-xs font-semibold text-slate-700">{student.provincial_address ?? "N/A"}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Document Submissions */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-5 py-4">
            <h4 className="text-base font-semibold text-slate-900">
              Document Submissions
            </h4>
          </div>
          <div className="p-5">
            <DataTable
              data={tableData}
              columns={columns}
              searchColumn="document_type"
              searchPlaceholder="Search documents..."
              mobileCard={(submission) => (
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 transition-all hover:shadow-sm active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900">{submission.document_type}</p>
                      <p className="text-xs text-slate-500 mt-1">{submission.submitted_at}</p>
                      <div className="mt-2">
                        <SubmissionStatusBadge status={submission.status as AdviserSubmissionStatus} />
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="rounded-full bg-primary px-3 text-[10px] font-semibold text-white shadow-sm hover:bg-primary/90 h-7 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/adviser/students/${student?.id}/review/${submission.id}`);
                      }}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      Review
                    </Button>
                  </div>
                </div>
              )}
            />
          </div>
        </div>
      </motion.div>

    </div>
  );
}
