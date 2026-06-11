"use client";

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md rounded-2xl p-6">
        <DialogHeader className="flex flex-row items-center gap-3 space-y-0">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-lg font-semibold">
            Final Confirmation
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm leading-relaxed text-slate-600">
          Are you sure you want to submit all the documents? Once submitted, you
          will not be able to edit the files while they are being processed by
          your adviser.
        </p>

        <div className="flex gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1 rounded-xl font-bold"
            onClick={() => onOpenChange(false)}
          >
            Review Again
          </Button>
          <Button
            type="submit"
            className="flex-1 rounded-xl bg-primary font-bold text-white shadow-md hover:bg-primary/90"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            Confirm &amp; Submit
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
