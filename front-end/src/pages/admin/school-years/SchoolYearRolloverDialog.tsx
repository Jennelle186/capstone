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
import { Switch } from "@/components/ui/switch";
import type { SchoolYearRecord, SchoolYearRolloverFormState } from "@/types/schoolYear";

interface SchoolYearRolloverDialogProps {
    handleRolloverOpenChange: (open: boolean) => void;
    isRolloverOpen: boolean;
    isSaving: boolean;
    rolloverFormData: SchoolYearRolloverFormState;
    rolloverSourceSchoolYear: SchoolYearRecord | null;
    setRolloverFormData: Dispatch<SetStateAction<SchoolYearRolloverFormState>>;
    submitRollover: () => void | Promise<void>;
}

export default function SchoolYearRolloverDialog({
    handleRolloverOpenChange,
    isRolloverOpen,
    isSaving,
    rolloverFormData,
    rolloverSourceSchoolYear,
    setRolloverFormData,
    submitRollover,
}: SchoolYearRolloverDialogProps) {
    return (
        <Dialog open={isRolloverOpen} onOpenChange={handleRolloverOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Rollover School Year</DialogTitle>
                    <DialogDescription>
                        {rolloverSourceSchoolYear
                            ? `Create a new school year from ${rolloverSourceSchoolYear.name}.`
                            : "Create a new school year from the selected school year."}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="rollover-name">School Year Name</Label>
                        <Input
                            id="rollover-name"
                            value={rolloverFormData.name}
                            onChange={(event) => setRolloverFormData((prev) => ({ ...prev, name: event.target.value }))}
                        />
                        <p className="text-xs text-muted-foreground">
                            Suggested from the next available school year after existing records.
                        </p>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="rollover-start">Start Date</Label>
                            <Input
                                id="rollover-start"
                                type="date"
                                value={rolloverFormData.startDate}
                                onChange={(event) => setRolloverFormData((prev) => ({ ...prev, startDate: event.target.value }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="rollover-end">End Date</Label>
                            <Input
                                id="rollover-end"
                                type="date"
                                value={rolloverFormData.endDate}
                                onChange={(event) => setRolloverFormData((prev) => ({ ...prev, endDate: event.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="rollover-auto-close">Automatic Closure Date</Label>
                        <Input
                            id="rollover-auto-close"
                            type="date"
                            value={rolloverFormData.autoClosureDate}
                            onChange={(event) => setRolloverFormData((prev) => ({ ...prev, autoClosureDate: event.target.value }))}
                        />
                    </div>
                    <div className="space-y-3 rounded-md border p-3">
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="copy-assignments">Copy adviser assignments</Label>
                            <Switch
                                id="copy-assignments"
                                checked={rolloverFormData.copyAssignments}
                                onCheckedChange={(checked) => setRolloverFormData((prev) => ({ ...prev, copyAssignments: checked }))}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="copy-requirements">Copy document requirements</Label>
                            <Switch
                                id="copy-requirements"
                                checked={rolloverFormData.copyRequirements}
                                onCheckedChange={(checked) => setRolloverFormData((prev) => ({ ...prev, copyRequirements: checked }))}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="rollover-active">Set as active</Label>
                            <Switch
                                id="rollover-active"
                                checked={rolloverFormData.setAsActive}
                                onCheckedChange={(checked) => setRolloverFormData((prev) => ({ ...prev, setAsActive: checked }))}
                            />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => handleRolloverOpenChange(false)} disabled={isSaving}>
                        Cancel
                    </Button>
                    <Button onClick={() => void submitRollover()} disabled={isSaving}>
                        {isSaving ? "Creating..." : "Create Rollover"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
