import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Users, ChevronRight } from "lucide-react";
import { type ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import PageHeader from "@/components/adviser/ui/PageHeader";
import DataTable from "@/components/common/data-table/DataTable";
import { useAdviserStudents } from "@/hooks/useAdviserStudents";
import { useAdviserProfile } from "@/hooks/useAdviserProfile";
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
];

export default function AdviseesPage() {
  const navigate = useNavigate();
  const { students, loading } = useAdviserStudents();
  const { profile } = useAdviserProfile();

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
          <span
            className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${CLASSIFICATION_BADGE_CLASSES[classification]}`}
          >
            {CLASSIFICATION_LABELS[classification]}
          </span>
        );
      },
      filterFn: "equals",
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
          Clearance Progress
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
              {pct}% ({row.original.documents_submitted}/{row.original.documents_total} docs)
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
          <Badge className="bg-primary/15 text-primary text-sm font-extrabold px-3 py-0.5 rounded-lg mt-1 shrink-0">
            {students.length} Active
          </Badge>
        </div>
      </motion.div>

      {loading ? (
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
                    Clearance Progress
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
            </div>
            <div className="mt-2 space-y-1">
              <div className="text-[10px] font-bold text-slate-900">
                {(student.completion_pct ?? 0)}% ({student.documents_submitted}/{student.documents_total} docs)
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
      )}
    </div>
  );
}
