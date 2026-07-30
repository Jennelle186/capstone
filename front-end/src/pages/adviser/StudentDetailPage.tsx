import { useMemo } from "react";
import { useParams, useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Eye,
  Mail,
  Calendar,
  FileText,
  User,
  CheckCircle,
  XCircle,
  Loader2,
} from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DataTable from "@/components/common/data-table/DataTable";
import PageHeader from "@/components/adviser/ui/PageHeader";
import SubmissionStatusBadge from "@/components/adviser/ui/SubmissionStatusBadge";
import { useStudentDetail } from "@/hooks/useStudentDetail";
import { useUpdateStudentClassification } from "@/hooks/useUpdateStudentClassification";
import type { AdviserSubmissionStatus } from "@/types/adviser-dashboard";
import {
  CLASSIFICATION_LABELS,
  CLASSIFICATION_BADGE_CLASSES,
} from "@/types/adviser-students";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function formatLabelValue(key: string, val: string) {
  const label = key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bShs\b/i, "SHS")
    .replace(/\bJhs\b/i, "JHS");

  let value = val.replace(/_/g, " ");
  if (/^p\d+_?p?\d*$/i.test(value.replace(/\s/g, ""))) {
    value = value
      .toUpperCase()
      .replace(/P(\d+)/g, " ₱$1,")
      .replace(/_/g, " - ")
      .replace(/,\s*-/, " -");
  }
  return { label, value };
}



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
  const { student, submissions, slots, loading, error } = useStudentDetail(id);
  const { updateClassification, isUpdating } = useUpdateStudentClassification();

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
    [tableData, navigate, student?.id],
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
                  <AvatarImage src={student.image_url ?? undefined} />
                  <AvatarFallback className="text-lg font-bold bg-primary/10 text-primary">
                    {student.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-xl font-bold text-slate-900">{student.name}</h2>
                    <Select
                      value={student.classification}
                      onValueChange={async (value) => {
                        const ok = await updateClassification(student.id, value);
                        if (ok) window.location.reload();
                      }}
                      disabled={isUpdating}
                    >
                      <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 pr-1 [&>svg]:hidden">
                        <div className="flex items-center gap-1">
                          <SelectValue>
                            <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${CLASSIFICATION_BADGE_CLASSES[student.classification]}`}>
                              {CLASSIFICATION_LABELS[student.classification]}
                            </span>
                          </SelectValue>
                          {isUpdating ? (
                            <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><path d="m6 9 6 6 6-6"/></svg>
                          )}
                        </div>
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CLASSIFICATION_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value} className="text-xs">
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                {Object.entries(student.extracted_analytics ?? {}).map(([key, { value, label }]) => (
                  <div key={key} className="space-y-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-extrabold text-slate-800">{value}</p>
                  </div>
                ))}
              </div>

            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Extracted Data */}
      {(student.unmapped_data ?? []).length > 0 && (
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="extracted" className="border rounded-xl border-slate-200 bg-white shadow-sm overflow-hidden">
            <AccordionTrigger className="px-5 py-4 hover:no-underline [&[data-state=open]]:border-b [&[data-state=open]]:border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                  <FileText className="h-4 w-4" />
                </div>
                <span className="text-base font-semibold text-slate-900">Extracted Data</span>
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 rounded-full">
                  {student.unmapped_data!.reduce((s, g) => s + g.fields.filter((f) => f.value?.trim()).length, 0)}
                </Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent className="p-0">
              {student.unmapped_data!.map((group, gi) => {
                const sectionGroups: Record<string, typeof group.fields> = {};
                for (const field of group.fields) {
                  if (!field.value || field.value.trim() === "") continue;
                  const st = field.section_title;
                  if (!sectionGroups[st]) sectionGroups[st] = [];
                  sectionGroups[st].push(field);
                }
                const sectionKeys = Object.keys(sectionGroups);
                if (sectionKeys.length === 0) return null;

                return (
                  <div key={gi} className={gi > 0 ? "border-t border-slate-200" : ""}>
                    <div className="bg-slate-50/70 border-b border-slate-100 p-4 flex items-center gap-2.5">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Source Document
                        </p>
                        <p className="text-sm font-semibold text-slate-800">
                          {group.document_type}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="ml-auto text-xs bg-white font-medium border-slate-200 text-slate-600"
                      >
                        {sectionKeys.reduce((s, k) => s + sectionGroups[k].length, 0)} fields
                      </Badge>
                    </div>

                    <Accordion
                      type="multiple"
                      defaultValue={sectionKeys.slice(0, 1)}
                      className="w-full divide-y divide-slate-100"
                    >
                      {sectionKeys.map((sectionTitle) => {
                        const fields = sectionGroups[sectionTitle];
                        return (
                          <AccordionItem
                            value={sectionTitle}
                            key={sectionTitle}
                            className="border-b-0 px-4 py-1"
                          >
                            <AccordionTrigger className="hover:no-underline py-3 group">
                              <div className="flex items-center gap-2 text-slate-600 group-hover:text-slate-900 transition-colors">
                                <User className="h-4 w-4 text-slate-400 group-hover:text-slate-500" />
                                <span className="text-xs font-bold tracking-wide uppercase">
                                  {sectionTitle}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="ml-1 text-[10px] px-1.5 py-0 bg-slate-100 text-slate-500 rounded-full"
                                >
                                  {fields.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 pt-1">
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3.5 bg-slate-50/40 border border-slate-100/70 rounded-xl p-4">
                                {fields.map((f) => {
                                  const { label, value } = formatLabelValue(f.key, f.value);
                                  return (
                                    <div key={f.key} className="space-y-1 group/field">
                                      <span className="text-[10px] font-medium text-slate-400 block tracking-tight">
                                        {label}
                                      </span>
                                      <p className="text-xs font-semibold text-slate-700 break-words leading-relaxed select-all">
                                        {value}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </div>
                );
              })}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {/* Requirement Slots */}
      {slots && slots.length > 0 && (
        <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <Card className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/50 px-5 py-4">
              <h4 className="text-base font-semibold text-slate-900">Requirements</h4>
              {student?.application_status === "PENDING_DOCUMENTS" && (
                <Badge className="bg-amber-100 text-amber-700 text-xs font-semibold">
                  Pending Documents
                </Badge>
              )}
              {student?.application_status === "SUBMITTED_COMPLETE" && (
                <Badge className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  Complete
                </Badge>
              )}
            </div>
            <CardContent className="p-5">
              <div className="space-y-3">
                {slots.map((slot) => (
                  <div key={slot.id} className="flex items-start gap-3 text-sm">
                    {slot.is_complete ? (
                      <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className={`font-medium ${slot.is_complete ? "text-slate-600" : "text-slate-900"}`}
                      >
                        {slot.name}
                      </p>
                      {slot.items.length > 1 && slot.matched_document_type_names.length > 0 && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          Uploaded: {slot.matched_document_type_names.join(", ")}
                        </p>
                      )}
                      {slot.items.length > 1 && slot.matched_document_type_names.length === 0 && (
                        <p className="text-xs text-slate-400 mt-0.5 italic">
                          None uploaded yet
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {slot.is_complete ? (
                        <span className="text-xs text-emerald-600 font-medium">Complete</span>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">
                          {slot.matched_count}/{slot.min_required}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
