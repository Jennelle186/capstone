import { CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import MultiSelectCombobox from "@/components/ui/multi-select-combobox";
import type { DepartmentOption } from "@/types/department";

/// Dialog for assigning an adviser to one or more departments. The dialog is used in the adviser table and the adviser details page.
interface AssignDepartmentDialogProps {
    departments: DepartmentOption[];
    isSubmitting: boolean;
    isSubmissionDisabled?: boolean;
    onDepartmentsChange: (codes: string[]) => void;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void | Promise<void>;
    open: boolean;
    selectedAdviserName: string | null;
    selectedDepartments: string[];
    selectedSchoolYearName: string | null;
    // An inactive (deactivated) adviser can keep or lose programs they already hold, but
    // cannot be given new ones. The server enforces the same rule.
    adviserIsActive?: boolean;
    adviserCurrentDepartments?: string[];
}

// The dialog is used in the adviser table and the adviser details page. It allows the user to assign an adviser to one or more departments. The user can select departments from a multi-select combobox list. The user can cancel the assignment or confirm it by clicking the "Assign" button.
export default function AssignDepartmentDialog({
    departments,
    isSubmitting,
    isSubmissionDisabled = false,
    onDepartmentsChange,
    onOpenChange,
    onSubmit,
    open,
    selectedAdviserName,
    selectedDepartments,
    selectedSchoolYearName,
    adviserIsActive = true,
    adviserCurrentDepartments = [],
}: AssignDepartmentDialogProps) {
    const heldDepartments = new Set(adviserCurrentDepartments);
    const departmentOptions = departments
        .filter((department) =>
            adviserIsActive ? department.isActive : heldDepartments.has(department.value),
        )
        .map((department) => ({ value: department.value, label: department.label }));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Assign to Academic Program</DialogTitle>
                    <DialogDescription className="wrap-break-word">
                        {selectedAdviserName ? (
                            <>
                                Assign <strong>{selectedAdviserName}</strong> to one or more academic programs
                            </>
                        ) : null}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    {!adviserIsActive && (
                        <p role="note" className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                            This adviser is inactive. You can remove programs, but new programs can only be added after the adviser is activated.
                        </p>
                    )}
                    <p className="mb-3 text-xs text-muted-foreground">
                        {selectedSchoolYearName
                            ? `Assignment will be saved for S.Y. ${selectedSchoolYearName}.`
                            : "Select a school year first before assigning."}
                    </p>
                    <MultiSelectCombobox
                        options={departmentOptions}
                        value={selectedDepartments}
                        onValueChange={onDepartmentsChange}
                        placeholder="Select academic programs"
                        emptyMessage="No academic programs found."
                    />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void onSubmit()}
                        disabled={selectedDepartments.length === 0 || isSubmitting || isSubmissionDisabled}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Assign
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
