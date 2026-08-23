import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Users, ChevronRight, Loader2 } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/adviser/ui/PageHeader";
import ProgramSelector from "@/components/adviser/dashboard/ProgramSelector";
import DataTable from "@/components/common/data-table/DataTable";
import { useAdviserStudents } from "@/hooks/useAdviserStudents";
import { useAdviserProfile } from "@/hooks/useAdviserProfile";
import { useAdviserProgramScope } from "@/hooks/useAdviserProgramScope";
import { useUpdateStudentClassification } from "@/hooks/useUpdateStudentClassification";
import {
  type AdviserStudent,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_BADGE_CLASSES,
} from "@/types/adviser-students";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const classificationOptions = [
  { label: "All Classification", value: "all" },
  { label: "Freshman", value: "freshman" },
  { label: "Transferee", value: "transferee" },
  { label: "Shifter", value: "shifter" },
  { label: "Returning / Continuing", value: "returning" },
  { label: "Cross-Enrolee", value: "cross_enrollee" },
  { label: "Second Courser", value: "second_courser" },
];

export default function AdviseesPage() {
  const navigate = useNavigate();
  const { selectedDepartmentId, hasMultiplePrograms } = useAdviserProgramScope();
  const { students, loading } = useAdviserStudents(undefined, selectedDepartmentId);
  const { profile } = useAdviserProfile();
  const { updateClassification, isUpdating } = useUpdateStudentClassification();

  const columns: ColumnDef<AdviserStudent>[] = [
    {
      id: "student",
      accessorFn: (row) => `${row.name} ${row.student_number ?? ""}`,
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Student
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src={row.original.image_url ?? undefined} />
            <AvatarFallback>{row.original.initials}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-bold text-slate-900 text-sm">
              {row.original.name}
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-0.5">
              {row.original.student_number || <span className="text-destructive font-semibold">NO STUDENT ID</span>}
            </div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "classification",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Classification
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const classification = row.getValue("classification") as AdviserStudent["classification"];
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <Select
              value={classification}
              onValueChange={async (value) => {
                const ok = await updateClassification(row.original.id, value);
                if (ok) window.location.reload();
              }}
              disabled={isUpdating}
            >
              <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 pr-1 [&>svg]:hidden">
                <div className="flex items-center gap-1">
                  <SelectValue>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${CLASSIFICATION_BADGE_CLASSES[classification]}`}
                    >
                      {CLASSIFICATION_LABELS[classification]}
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
        );
      },
      filterFn: "equals",
    },
    {
      accessorKey: "application_status",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Application Status
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const status = row.getValue("application_status") as AdviserStudent["application_status"];
        if (status === "SUBMITTED_COMPLETE") {
          return (
            <Badge className="bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
              Complete
            </Badge>
          );
        }
        if (status === "PENDING_DOCUMENTS") {
          return (
            <Badge className="bg-amber-100 text-amber-700 text-[10px] font-semibold">
              Pending Docs
            </Badge>
          );
        }
        return (
          <Badge className="bg-slate-100 text-slate-600 text-[10px] font-semibold">
            In Progress
          </Badge>
        );
      },
    },
    {
      accessorKey: "completion_pct",
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8 text-xs font-semibold uppercase tracking-wider text-slate-600"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Document Progress
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const pct = (row.getValue("completion_pct") as number) ?? 0;
        const barColor =
          pct === 100
            ? "bg-emerald-500"
            : pct > 50
              ? "bg-primary"
              : "bg-amber-500";
        return (
          <div className="space-y-1.5 min-w-[140px] max-w-[200px]">
            <div className="text-[10px] font-bold text-slate-900">
              {pct}% ({row.original.documents_submitted}/{row.original.documents_total} reqs)
            </div>
            <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: "Actions",
      enableSorting: false,
      cell: () => (
        <div className="text-right">
          <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-primary transition-colors cursor-pointer">
            <span>View Documents</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="My Advisees"
            subtitle={`Student listings for ${profile?.department ?? "your program"} (${profile?.school_year ?? "Current School Year"})`}
          />
          <div className="flex items-center gap-2 shrink-0">
            {hasMultiplePrograms && <ProgramSelector compact />}
            <Badge className="bg-primary/15 text-primary text-sm font-extrabold px-3 py-0.5 rounded-lg mt-1">
              {students.length} Active
            </Badge>
          </div>
        </div>
      </motion.div>

      {loading && students.length === 0 ? (
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/75 hover:bg-slate-50/75 border-b border-slate-200">
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Student
                  </TableHead>
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Classification
                  </TableHead>
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Document Progress
                  </TableHead>
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <TableRow key={i}>
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="space-y-1.5 w-32">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-1.5 w-full rounded-full" />
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                      <Skeleton className="h-7 w-20 ml-auto rounded-lg" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : students.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-900">
            No advisees found
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Students will appear here once they are assigned to your program.
          </p>
        </div>
      ) : (
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60 backdrop-blur-[1px]">
              <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-md border border-slate-200">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs font-semibold text-slate-600">Loading advisees…</span>
              </div>
            </div>
          )}
          <motion.div variants={fadeInUp} initial="hidden" animate="visible">
          <DataTable
            data={students}
            columns={columns}
            searchColumn="student"
            searchPlaceholder="Search by name or student ID..."
            filterColumn="classification"
            filterOptions={classificationOptions}
            onRowClick={(student) =>
              navigate(`/adviser/students/${student.id}`)
            }
            mobileCard={(student) => (
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 transition-all hover:shadow-sm active:scale-[0.99]">
                <div className="flex items-start gap-3">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarImage src={student.image_url ?? undefined} />
                    <AvatarFallback>{student.initials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">
                      {student.name}
                    </p>
            <p className="text-[10px] uppercase tracking-tighter text-slate-400">
              {student.student_number ?? <span className="text-destructive font-semibold">NO STUDENT ID</span>}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${CLASSIFICATION_BADGE_CLASSES[student.classification]}`}
              >
                {CLASSIFICATION_LABELS[student.classification]}
              </span>
              {student.application_status === "PENDING_DOCUMENTS" && (
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">
                  Pending Docs
                </span>
              )}
              {student.application_status === "SUBMITTED_COMPLETE" && (
                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">
                  Complete
                </span>
              )}
            </div>
            <div className="mt-2 space-y-1">
              <div className="text-[10px] font-bold text-slate-900">
                {(student.completion_pct ?? 0)}% ({student.documents_submitted}/{student.documents_total} reqs)
              </div>
              <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${(student.completion_pct ?? 0) === 100 ? "bg-emerald-500" : (student.completion_pct ?? 0) > 50 ? "bg-primary" : "bg-amber-500"}`}
                  style={{ width: `${student.completion_pct ?? 0}%` }}
                />
              </div>
            </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0 mt-2" />
                </div>
              </div>
            )}
          />
        </motion.div>
        </div>
      )}
    </div>
  );
}
