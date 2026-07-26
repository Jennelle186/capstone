"use client";

import * as React from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router";
import { Loader2, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function DeactivateAccountDialog() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleDeactivate = async () => {
    if (!user) return;
    setDeleting(true);
    try {
      await user.delete();
      toast.success("Account deleted.");
      navigate("/");
    } catch {
      toast.error("Failed to delete account.");
      setDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          className="text-red-600 hover:text-red-700 hover:bg-red-50 gap-2 rounded-xl font-semibold"
        >
          <TriangleAlert className="h-4 w-4" />
          Deactivate Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="rounded-2xl max-w-md">
        <AlertDialogHeader>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 mb-2">
            <TriangleAlert className="h-7 w-7 text-red-600" />
          </div>
          <AlertDialogTitle className="text-center text-xl">
            Deactivate your account?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center text-sm text-slate-500">
            This will permanently delete your account, all your documents, and
            submitted records. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="sm:justify-center gap-3">
          <AlertDialogCancel className="rounded-xl w-full sm:w-auto" disabled={deleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeactivate}
            disabled={deleting}
            className="rounded-xl bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto gap-2"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              "Yes, delete my account"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
