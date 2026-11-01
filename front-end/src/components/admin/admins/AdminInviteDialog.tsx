"use client";

import { useState } from "react";

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
import type { AdminInvitePayload } from "@/types/adminManagement";

interface AdminInviteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isSubmitting: boolean;
    onSubmit: (payload: AdminInvitePayload) => void;
}

const EMPTY_FORM: AdminInvitePayload = {
    email: "",
    first_name: "",
    middle_name: "",
    last_name: "",
};

export default function AdminInviteDialog({
    open,
    onOpenChange,
    isSubmitting,
    onSubmit,
}: AdminInviteDialogProps) {
    const [form, setForm] = useState<AdminInvitePayload>(EMPTY_FORM);

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) setForm(EMPTY_FORM);
        onOpenChange(nextOpen);
    };

    const isFormValid =
        form.email.trim().length > 0 &&
        form.first_name.trim().length > 0 &&
        form.last_name.trim().length > 0;

    const handleSubmit = () => {
        if (!isFormValid || isSubmitting) return;
        onSubmit({
            email: form.email.trim(),
            first_name: form.first_name.trim(),
            middle_name: form.middle_name.trim(),
            last_name: form.last_name.trim(),
        });
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Invite Administrator</DialogTitle>
                    <DialogDescription>
                        Send an invitation email. The recipient will become an administrator after
                        accepting.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label htmlFor="admin-invite-email">Email</Label>
                        <Input
                            id="admin-invite-email"
                            type="email"
                            placeholder="name@example.edu"
                            value={form.email}
                            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label htmlFor="admin-invite-first">First Name</Label>
                            <Input
                                id="admin-invite-first"
                                value={form.first_name}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, first_name: e.target.value }))
                                }
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="admin-invite-last">Last Name</Label>
                            <Input
                                id="admin-invite-last"
                                value={form.last_name}
                                onChange={(e) =>
                                    setForm((prev) => ({ ...prev, last_name: e.target.value }))
                                }
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="admin-invite-middle">
                            Middle Name <span className="text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                            id="admin-invite-middle"
                            value={form.middle_name}
                            onChange={(e) =>
                                setForm((prev) => ({ ...prev, middle_name: e.target.value }))
                            }
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!isFormValid || isSubmitting}>
                        {isSubmitting ? "Sending…" : "Send Invitation"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
