import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";

interface DeleteAdviserDialogProps {
    adviserName: string | null;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
    open: boolean;
}

export default function DeleteAdviserDialog({
    adviserName,
    onConfirm,
    onOpenChange,
    open,
}: DeleteAdviserDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Delete Adviser</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to delete {adviserName}? This action cannot be undone.
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={onConfirm}>
                        Delete
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
