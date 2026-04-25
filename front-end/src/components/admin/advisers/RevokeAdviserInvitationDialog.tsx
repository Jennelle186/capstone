import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface RevokeAdviserInvitationDialogProps {
    invitationEmail: string | null;
    isSubmitting: boolean;
    onConfirm: () => void | Promise<void>;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}

export default function RevokeAdviserInvitationDialog({
    invitationEmail,
    isSubmitting,
    onConfirm,
    onOpenChange,
    open,
}: RevokeAdviserInvitationDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Revoke Adviser Invitation</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to revoke the invitation for {invitationEmail}? The recipient will no longer be able to use this invite link.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={() => void onConfirm()} disabled={isSubmitting}>
                        {isSubmitting ? "Revoking..." : "Revoke Access"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
