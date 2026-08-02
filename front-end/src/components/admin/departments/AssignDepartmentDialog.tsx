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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { DepartmentOption } from "@/types/department";

/// Dialog for assigning an adviser to a department. The dialog is used in the adviser table and the adviser details page.
interface AssignDepartmentDialogProps {
    departments: DepartmentOption[];
    isSubmitting: boolean;
    isSubmissionDisabled?: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void | Promise<void>;
    onValueChange: (value: string) => void;
    open: boolean;
    selectedAdviserName: string | null;
    selectedDepartment: string;
    selectedSchoolYearName: string | null;
    getDepartmentAdviserCount: (departmentCode: string) => number;
}

// The dialog is used in the adviser table and the adviser details page. It allows the user to assign an adviser to a department. The user can select a department from a dropdown list. The dropdown list shows the number of advisers in each department. The user can cancel the assignment or confirm it by clicking the "Assign" button.
export default function AssignDepartmentDialog({
    departments,
    getDepartmentAdviserCount,
    isSubmitting,
    isSubmissionDisabled = false,
    onOpenChange,
    onSubmit,
    onValueChange,
    open,
    selectedAdviserName,
    selectedDepartment,
    selectedSchoolYearName,
}: AssignDepartmentDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Assign to Academic Program</DialogTitle>
                    <DialogDescription className="wrap-break-word">
                        {selectedAdviserName ? (
                            <>
                                Assign <strong>{selectedAdviserName}</strong> to an academic program
                            </>
                        ) : null}
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <p className="mb-3 text-xs text-muted-foreground">
                        {selectedSchoolYearName
                            ? `Assignment will be saved for S.Y. ${selectedSchoolYearName}.`
                            : "Select a school year first before assigning."}
                    </p>
                    <Select value={selectedDepartment} onValueChange={onValueChange}>
                        <SelectTrigger>
                            <SelectValue placeholder="Select academic program" />
                        </SelectTrigger>
                        <SelectContent>
                            {departments
                                .filter((department) => department.isActive)
                                .map((department) => (
                                    <SelectItem key={department.id} value={department.value}>
                                        <div className="flex w-full min-w-0 items-center justify-between gap-2">
                                            <span className="min-w-0 wrap-break-word text-left">{department.label}</span>
                                            <span className="text-muted-foreground shrink-0 text-xs">
                                                ({getDepartmentAdviserCount(department.value)} advisers)
                                            </span>
                                        </div>
                                    </SelectItem>
                                ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button
                        onClick={() => void onSubmit()}
                        disabled={!selectedDepartment || isSubmitting || isSubmissionDisabled}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Assign
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
