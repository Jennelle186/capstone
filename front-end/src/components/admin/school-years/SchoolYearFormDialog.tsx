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
import { Switch } from "@/components/ui/switch";
import type { SchoolYearCreateFormState, SchoolYearStatus } from "@/types/schoolYear";

interface SchoolYearFormDialogProps {
    description?: string;
    error?: string;
    form: SchoolYearCreateFormState;
    isSubmitting: boolean;
    onChange: Dispatch<SetStateAction<SchoolYearCreateFormState>>;
    onOpenChange: (open: boolean) => void;
    onSubmit: () => void | Promise<void>;
    open: boolean;
    submitLabel?: string;
    submittingLabel?: string;
    title?: string;
}

// A dialog component for creating or editing a school year, with form fields for name, start date, end date, status, and an option to set it as active. Displays validation errors and handles submission state.
export default function SchoolYearFormDialog({
    description = "Configure the academic year details and set whether this should be active.",
    error,
    form,
    isSubmitting,
    onChange,
    onOpenChange,
    onSubmit,
    open,
    submitLabel = "Save",
    submittingLabel = "Saving...",
    title = "School Year",
}: SchoolYearFormDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="school-year-name">School Year Name</Label>
                        <Input
                            id="school-year-name"
                            placeholder="2026-2027"
                            value={form.name}
                            onChange={(event) => onChange((prev) => ({ ...prev, name: event.target.value }))}
                        />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="school-year-start">Start Date</Label>
                            <Input
                                id="school-year-start"
                                type="date"
                                value={form.startDate}
                                onChange={(event) => onChange((prev) => ({ ...prev, startDate: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="school-year-end">End Date</Label>
                            <Input
                                id="school-year-end"
                                type="date"
                                value={form.endDate}
                                onChange={(event) => onChange((prev) => ({ ...prev, endDate: event.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="school-year-auto-closure">Automatic Closure Date (Optional)</Label>
                        <Input
                            id="school-year-auto-closure"
                            type="date"
                            value={form.autoClosureDate}
                            onChange={(event) => onChange((prev) => ({ ...prev, autoClosureDate: event.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            Set the admin-approved date when this school year will automatically close and archive.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <Label>Status</Label>
                        <Select
                            value={form.status}
                            onValueChange={(value: SchoolYearStatus) => onChange((prev) => ({ ...prev, status: value }))}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="upcoming">Open</SelectItem>
                                <SelectItem value="active">Active</SelectItem>
                                <SelectItem value="closed">Closed / Archived</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-foreground">Set as Active</p>
                                <p className="text-xs text-muted-foreground">
                                    Enable this to use the selected school year for all new records.
                                </p>
                            </div>
                            <Switch
                                checked={form.setAsActive}
                                onCheckedChange={(checked) => onChange((prev) => ({ ...prev, setAsActive: checked }))}
                            />
                        </div>
                    </div>
                    {form.setAsActive ? (
                        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            Setting this school year as active will apply it to all new submissions and records.
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
