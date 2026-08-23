import type { Dispatch, SetStateAction } from "react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MultiSelectCombobox from "@/components/ui/multi-select-combobox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { AdviserFormState } from "@/types/adviser";
import type { Option } from "@/types/department";

// The AdviserFormDialog component is a reusable dialog form used for both adding and editing advisers. It includes fields for the adviser's name, email, department, and school year, with validation and submission handling. The form also supports dynamic options for departments and school years, including the ability to trigger the creation of new options directly from the dropdowns. The component is designed to be flexible and can be easily integrated into different parts of the admin interface where adviser management is needed.
interface AdviserFormDialogProps {
    addDepartmentValue: string;
    addSchoolYearValue: string;
    departments: Option[];
    formData: AdviserFormState;
    isFormValid: boolean;
    isSubmitting: boolean;
    mode: "add" | "edit";
    onDepartmentCodesChange: (codes: string[]) => void;
    onDepartmentSelect: (value: string) => void;
    onFormChange: Dispatch<SetStateAction<AdviserFormState>>;
    onOpenChange: (open: boolean) => void;
    onSchoolYearSelect: (value: string) => void;
    onSubmit: () => void | Promise<void>;
    open: boolean;
    schoolYears: Option[];
}

// The AdviserFormDialog component is a reusable dialog form used for both adding and editing advisers. It includes fields for the adviser's name, email, department, and school year, with validation and submission handling. The form also supports dynamic options for departments and school years, including the ability to trigger the creation of new options directly from the dropdowns. The component is designed to be flexible and can be easily integrated into different parts of the admin interface where adviser management is needed.
export default function AdviserFormDialog({
    addDepartmentValue,
    addSchoolYearValue,
    departments,
    formData,
    isFormValid,
    isSubmitting,
    mode,
    onDepartmentCodesChange,
    onDepartmentSelect,
    onFormChange,
    onOpenChange,
    onSchoolYearSelect,
    onSubmit,
    open,
    schoolYears,
}: AdviserFormDialogProps) {
    const isEditMode = mode === "edit";
    const idPrefix = isEditMode ? "edit" : "new";

    // The AdviserFormDialog component is a reusable dialog form used for both adding and editing advisers. It includes fields for the adviser's name, email, department, and school year, with validation and submission handling. The form also supports dynamic options for departments and school years, including the ability to trigger the creation of new options directly from the dropdowns. The component is designed to be flexible and can be easily integrated into different parts of the admin interface where adviser management is needed.
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEditMode ? "Edit Adviser" : "Add New Adviser"}</DialogTitle>
                    <DialogDescription>
                        {isEditMode
                            ? "Update adviser information."
                            : "Fill in adviser details. Fields marked with * are required."}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor={`${idPrefix}-first-name`}>First Name *</Label>
                            <Input
                                id={`${idPrefix}-first-name`}
                                placeholder="First name"
                                value={formData.firstName}
                                onChange={(event) => onFormChange((prev) => ({ ...prev, firstName: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor={`${idPrefix}-middle-name`}>Middle Name</Label>
                            <Input
                                id={`${idPrefix}-middle-name`}
                                placeholder="Middle name (optional)"
                                value={formData.middleName}
                                onChange={(event) => onFormChange((prev) => ({ ...prev, middleName: event.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${idPrefix}-last-name`}>Last Name *</Label>
                        <Input
                            id={`${idPrefix}-last-name`}
                            placeholder="Last name"
                            value={formData.lastName}
                            onChange={(event) => onFormChange((prev) => ({ ...prev, lastName: event.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${idPrefix}-email`}>Email Address *</Label>
                        <Input
                            id={`${idPrefix}-email`}
                            type="email"
                            placeholder="adviser@academy.edu"
                            value={formData.email}
                            onChange={(event) => onFormChange((prev) => ({ ...prev, email: event.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${idPrefix}-department`}>
                            {isEditMode ? "Academic Programs *" : "Academic Program *"}
                        </Label>
                        {isEditMode ? (
                            <MultiSelectCombobox
                                id={`${idPrefix}-department`}
                                options={departments}
                                value={formData.departmentCodes}
                                onValueChange={onDepartmentCodesChange}
                                placeholder="Select academic programs"
                                emptyMessage="No academic programs found."
                            />
                        ) : (
                            <Select value={formData.department} onValueChange={onDepartmentSelect}>
                                <SelectTrigger id={`${idPrefix}-department`}>
                                    <SelectValue placeholder="Select academic program" />
                                </SelectTrigger>
                                <SelectContent>
                                    {departments.map((department) => (
                                        <SelectItem key={department.value} value={department.value}>
                                            {department.label}
                                        </SelectItem>
                                    ))}
                                    <div className="my-1 h-px bg-border" />
                                    <SelectItem value={addDepartmentValue}>+ Add new academic program</SelectItem>
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor={`${idPrefix}-school-year`}>School Year *</Label>
                        <Select value={formData.schoolYear} onValueChange={onSchoolYearSelect}>
                            <SelectTrigger id={`${idPrefix}-school-year`}>
                                <SelectValue placeholder="Select school year" />
                            </SelectTrigger>
                            <SelectContent>
                                {schoolYears.map((schoolYear) => (
                                    <SelectItem key={schoolYear.value} value={schoolYear.value}>
                                        {schoolYear.label}
                                    </SelectItem>
                                ))}
                                <div className="my-1 h-px bg-border" />
                                <SelectItem value={addSchoolYearValue}>+ Add new school year</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={() => void onSubmit()} disabled={!isFormValid || isSubmitting}>
                        {isEditMode
                            ? (isSubmitting ? "Saving..." : "Save Changes")
                            : (isSubmitting ? "Sending Invite..." : "Add Adviser")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
