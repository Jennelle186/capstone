import { useEffect } from "react";
import { GraduationCap } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdviserProgramScope } from "@/hooks/useAdviserProgramScope";
import { useAdviserDepartments } from "@/hooks/useAdviserDepartments";

interface ProgramSelectorProps {
  compact?: boolean;
  schoolYearId?: string;
}

// Department filter dropdown shown to advisers assigned to multiple programs.
// "All Programs" (empty value) maps to a null selection meaning no filter.
// When ``schoolYearId`` is provided, the options are scoped to that school
// year; otherwise they default to the active school year.
export default function ProgramSelector({ compact = false, schoolYearId }: ProgramSelectorProps) {
  const { selectedDepartmentId, setSelectedDepartmentId } = useAdviserProgramScope();
  const { departments } = useAdviserDepartments(schoolYearId);

  // Clear a selection that is no longer valid for the currently shown year
  // (e.g. after switching to a school year where that department isn't assigned).
  useEffect(() => {
    if (
      selectedDepartmentId &&
      departments.length > 0 &&
      !departments.some((d) => d.id === selectedDepartmentId)
    ) {
      setSelectedDepartmentId(null);
    }
  }, [departments, selectedDepartmentId, setSelectedDepartmentId]);

  if (departments.length <= 1) return null;

  return (
    <Select
      value={selectedDepartmentId ?? "__all__"}
      onValueChange={(value) => setSelectedDepartmentId(value === "__all__" ? null : value)}
    >
      <SelectTrigger
        size={compact ? "sm" : "default"}
        className="h-8 w-44 rounded-lg border-slate-200 bg-white text-xs font-semibold text-slate-700 shadow-sm"
      >
        <GraduationCap className="mr-1 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <SelectValue placeholder="All Programs" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all__">All Programs</SelectItem>
        {departments.map((dept) => (
          <SelectItem key={dept.id} value={dept.id}>
            {dept.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}