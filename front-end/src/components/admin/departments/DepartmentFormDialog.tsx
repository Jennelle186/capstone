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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { DepartmentCreateFormState } from "@/types/department";

/// Dialog for creating or editing a department. The dialog is used in the department table and the department details page. It allows the user to enter the department code and name. The user can also select the status of the department if the showStatus prop is true. The user can cancel the creation or editing or confirm it by clicking the "Save" button.
interface DepartmentFormDialogProps {
    description?: string;
    error?: string;
    form: DepartmentCreateFormState;
    isSubmitting: boolean;
    onChange: Dispatch<SetStateAction<DepartmentCreateFormState>>;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void | Promise<void>;
    open: boolean;
    showStatus?: boolean;
    statusValue?: "active" | "inactive";
    submitLabel?: string;
    submittingLabel?: string;
    title?: string;
    onStatusChange?: (value: "active" | "inactive") => void;
}

// The dialog is used in the department table and the department details page. It allows the user to enter the department code and name. The user can also select the status of the department if the showStatus prop is true. The user can cancel the creation or editing or confirm it by clicking the "Save" button.
export default function DepartmentFormDialog({
    description = "Create a new academic program for adviser assignment.",
    error,
    form,
    isSubmitting,
    onChange,
    onOpenChange,
    onSubmit,
    open,
    showStatus = false,
    statusValue = "active",
    submitLabel = "Save",
    submittingLabel = "Saving...",
    title = "Academic Program",
    onStatusChange,
}: DepartmentFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="department-code">Program Code</Label>
                        <Input
                            id="department-code"
                            placeholder="e.g., SE"
                            value={form.code}
                            onChange={(event) => onChange((prev) => ({ ...prev, code: event.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="department-name">Program Name</Label>
                        <Input
                            id="department-name"
                            placeholder="e.g., Software Engineering"
                            value={form.name}
                            onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
                        />
                    </div>
                    {showStatus && onStatusChange ? (
                        <div className="space-y-2">
                            <Label htmlFor="department-status">Status</Label>
                            <Select value={statusValue} onValueChange={(value) => onStatusChange(value as "active" | "inactive")}>
                                <SelectTrigger id="department-status">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    ) : null}
                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={() => void onSubmit()} disabled={isSubmitting}>
                        {isSubmitting ? submittingLabel : submitLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
