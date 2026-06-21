import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "framer-motion";
import {
  Search,
  Users,
  ListFilter,
  ArrowUpDown,
  FileCheck,
  ChevronRight,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import PageHeader from "@/components/adviser/ui/PageHeader";
import { useAdviserStudents } from "@/hooks/useAdviserStudents";
import {
  CLASSIFICATION_LABELS,
  CLASSIFICATION_BADGE_CLASSES,
} from "@/types/adviser-students";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

export default function AdviseesPage() {
  const navigate = useNavigate();
  const { students, loading } = useAdviserStudents();

  const [searchTerm, setSearchTerm] = useState("");
  const [classificationFilter, setClassificationFilter] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");

  const filteredAndSorted = useMemo(() => {
    return students
      .filter((s) => {
        const matchesSearch =
          s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.student_number?.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesClass =
          classificationFilter === "all" ||
          s.classification === classificationFilter;
        return matchesSearch && matchesClass;
      })
      .sort((a, b) => {
        if (sortBy === "name_asc") return a.name.localeCompare(b.name);
        if (sortBy === "student_id_asc") {
          return (a.student_number ?? "").localeCompare(b.student_number ?? "");
        }
        if (sortBy === "recently_added") {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return 0;
      });
  }, [searchTerm, classificationFilter, sortBy, students]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="My Advisees"
            subtitle="Student listings in your adviser program for the current school year."
          />
          <Badge className="bg-primary/15 text-primary text-sm font-extrabold px-3 py-0.5 rounded-lg mt-1 shrink-0">
            {students.length} Active
          </Badge>
        </div>
      </motion.div>

      {/* Filters Panel */}
      <motion.div variants={fadeInUp} initial="hidden" animate="visible">
        <Card className="p-4 bg-white border border-slate-200 shadow-sm rounded-xl">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            {/* Search */}
            <div className="md:col-span-5 relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <Search className="h-4 w-4" />
              </span>
              <Input
                placeholder="Search by name or student ID..."
                className="pl-10 rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Classification Filter */}
            <div className="md:col-span-4 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap flex items-center gap-1">
                <ListFilter className="h-4 w-4" /> Classification
              </span>
              <Select
                value={classificationFilter}
                onValueChange={setClassificationFilter}
              >
                <SelectTrigger className="rounded-xl text-xs font-semibold h-9">
                  <SelectValue placeholder="All Classification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classification</SelectItem>
                  <SelectItem value="freshman">Freshman</SelectItem>
                  <SelectItem value="transferee">Transferee</SelectItem>
                  <SelectItem value="shifter">Shifter</SelectItem>
                  <SelectItem value="returning">Returning / Continuing</SelectItem>
                  <SelectItem value="cross_enrollee">Cross-Enrolee</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="md:col-span-3 flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 whitespace-nowrap flex items-center gap-1">
                <ArrowUpDown className="h-4 w-4" /> Sort
              </span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="rounded-xl text-xs font-semibold h-9">
                  <SelectValue placeholder="Name A-Z" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Name A-Z</SelectItem>
                  <SelectItem value="recently_added">Recently Added</SelectItem>
                  <SelectItem value="student_id_asc">Student ID</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </motion.div>

      {/* Student Table */}
      {loading ? (
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/75 hover:bg-slate-50/75 border-b border-slate-200">
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Student</TableHead>
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Program</TableHead>
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Classification</TableHead>
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Document Progress</TableHead>
                  <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Actions</TableHead>
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
                    <TableCell className="px-6 py-4"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell className="px-6 py-4"><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="space-y-1.5 w-32">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-1.5 w-full rounded-full" />
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right"><Skeleton className="h-7 w-20 ml-auto rounded-lg" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : filteredAndSorted.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <Users className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-base font-semibold text-slate-900">No advisees match your criteria</p>
          <p className="text-xs text-slate-400 mt-1">Try resetting classification filters or clearing search text.</p>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/75 hover:bg-slate-50/75 border-b border-slate-200">
                    <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Student</TableHead>
                    <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Program</TableHead>
                    <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Classification</TableHead>
                    <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Clearance Progress</TableHead>
                    <TableHead className="px-6 py-3.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSorted.map((student) => {
                    const badgeClass = CLASSIFICATION_BADGE_CLASSES[student.classification];
                    const barColor =
                      student.completion_pct === 100
                        ? "bg-emerald-500"
                        : student.completion_pct > 50
                          ? "bg-primary"
                          : "bg-amber-500";

                    return (
                      <TableRow
                        key={student.id}
                        className="hover:bg-slate-50/40 cursor-pointer transition-colors group"
                        onClick={() => navigate(`/adviser/students/${student.id}`)}
                      >
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 hover:scale-105 transition duration-150">
                              <AvatarFallback>{student.initials}</AvatarFallback>
                            </Avatar>
                            <div>
                              <div className="font-bold text-slate-900 text-sm group-hover:text-primary transition-colors">
                                {student.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                                {student.student_number || "NO STUDENT ID"}
                              </div>
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-6 py-4">
                          <span className="text-[10px] font-extrabold text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-100 uppercase tracking-wide">
                            {student.program}
                          </span>
                        </TableCell>

                        <TableCell className="px-6 py-4">
                          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full ${badgeClass}`}>
                            {CLASSIFICATION_LABELS[student.classification]}
                          </span>
                        </TableCell>

                        <TableCell className="px-6 py-4">
                          <div className="space-y-1.5 min-w-[140px] max-w-[200px]">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                              <span className="flex items-center gap-1">
                                <FileCheck className="h-3 w-3 text-primary" />
                                {student.documents_submitted}/{student.documents_total} docs
                              </span>
                              <span className="text-slate-900">{student.completion_pct}%</span>
                            </div>
                            <div className="relative h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                                style={{ width: `${student.completion_pct}%` }}
                              />
                            </div>
                          </div>
                        </TableCell>

                        <TableCell className="px-6 py-4 text-right">
                          <div className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-primary transition-colors">
                            <span>View Documents  </span>
                            <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-1" />
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
