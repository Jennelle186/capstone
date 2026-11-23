"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { fetchWithClerkAuth } from "@/lib/api";

interface DeleteFlaggedFileProps {
  submissionId: string;
  filename: string;
  getToken: () => Promise<string | null>;
  onDeleted: (submissionId: string) => void;
  size?: "sm" | "default";
}

// Deletes a file the automatic check flagged. The student can use this instead of resolving it.
export default function DeleteFlaggedFile({ submissionId, filename, getToken, onDeleted, size = "sm" }: DeleteFlaggedFileProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in.");
      const res = await fetchWithClerkAuth(`/api/me/documents/${submissionId}`, token, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: unknown } | null;
        throw new Error(typeof body?.detail === "string" ? body.detail : "The file could not be deleted.");
      }
      toast.success("File removed. You can upload a new one.");
      onDeleted(submissionId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The file could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size={size} variant="outline" disabled={deleting} className="gap-1.5 rounded-lg border-red-300 text-red-700 hover:bg-red-50">
          {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this file?</AlertDialogTitle>
          <AlertDialogDescription className="break-all">
            {filename} will be removed. You can upload it again at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep file</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">
            Delete file
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
