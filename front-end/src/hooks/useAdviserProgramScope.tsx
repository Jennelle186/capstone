"use client";

/* eslint-disable react-refresh/only-export-components */
// This file intentionally co-locates the provider component and its consumer
// hook so the program scope can be imported from a single module.

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useAdviserDepartments } from "@/hooks/useAdviserDepartments";
import type { AdviserDepartment } from "@/types/adviser";

interface AdviserProgramScopeValue {
  departments: AdviserDepartment[];
  selectedDepartmentId: string | null;
  setSelectedDepartmentId: (departmentId: string | null) => void;
  activeDepartment: AdviserDepartment | null;
  hasMultiplePrograms: boolean;
}

const AdviserProgramScopeContext = createContext<AdviserProgramScopeValue | null>(null);

// Provides the adviser's assigned departments and the currently selected
// department filter (null = "all programs") to all adviser pages.
export function AdviserProgramScopeProvider({ children }: { children: ReactNode }) {
  const { departments: assignedDepartments } = useAdviserDepartments();
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);

  // The assignments endpoint is authoritative and always returns real UUIDs.
  const departments = assignedDepartments;

  const [prevDepartments, setPrevDepartments] = useState(departments);

  // Reset the selection to "all programs" whenever the selected department is
  // no longer present in the assigned list (adjusting state during render).
  if (prevDepartments !== departments) {
    setPrevDepartments(departments);
    if (selectedDepartmentId !== null && !departments.some((d) => d.id === selectedDepartmentId)) {
      setSelectedDepartmentId(null);
    }
  }

  const activeDepartment = useMemo<AdviserDepartment | null>(
    () => departments.find((d) => d.id === selectedDepartmentId) ?? null,
    [departments, selectedDepartmentId],
  );

  const hasMultiplePrograms = departments.length > 1;

  const value = useMemo<AdviserProgramScopeValue>(
    () => ({
      departments,
      selectedDepartmentId,
      setSelectedDepartmentId,
      activeDepartment,
      hasMultiplePrograms,
    }),
    [departments, selectedDepartmentId, setSelectedDepartmentId, activeDepartment, hasMultiplePrograms],
  );

  return (
    <AdviserProgramScopeContext.Provider value={value}>
      {children}
    </AdviserProgramScopeContext.Provider>
  );
}

// Consumes the program scope context, throwing when used outside the provider.
export function useAdviserProgramScope() {
  const context = useContext(AdviserProgramScopeContext);
  if (!context) {
    throw new Error("useAdviserProgramScope must be used within AdviserProgramScopeProvider");
  }
  return context;
}