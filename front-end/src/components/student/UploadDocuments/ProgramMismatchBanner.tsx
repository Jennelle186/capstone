"use client";

import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { fetchWithClerkAuth } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DepartmentOption {
  id: string;
  code: string;
  name: string;
}

interface MeResponse {
  program_id: string | null;
  program_mismatch_pending?: boolean;
  program_mismatch_extracted?: string | null;
}

interface ProgramMismatchBannerProps {
  getToken: () => Promise<string | null>;
  onResolved?: () => void;
  onPendingChange?: (pending: boolean) => void;
}

export default function ProgramMismatchBanner({
  getToken,
  onResolved,
  onPendingChange,
}: ProgramMismatchBannerProps) {
  const [pending, setPending] = React.useState<boolean | null>(null);
  const [extracted, setExtracted] = React.useState<string | null>(null);
  const [currentProgramId, setCurrentProgramId] = React.useState<string | null>(null);
  const [departments, setDepartments] = React.useState<DepartmentOption[]>([]);
  const [resolving, setResolving] = React.useState(false);

  const getTokenRef = React.useRef(getToken);
  React.useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const onResolvedRef = React.useRef(onResolved);
  React.useEffect(() => {
    onResolvedRef.current = onResolved;
  }, [onResolved]);

  const onPendingChangeRef = React.useRef(onPendingChange);
  React.useEffect(() => {
    onPendingChangeRef.current = onPendingChange;
  }, [onPendingChange]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getTokenRef.current();
      if (!token || cancelled) return;
      const [meRes, deptRes] = await Promise.all([
        fetchWithClerkAuth("/api/me", token),
        fetchWithClerkAuth("/api/me/departments", token),
      ]);
      if (cancelled) return;

      if (meRes.ok) {
        const me = (await meRes.json()) as MeResponse;
        const isPending = !!me.program_mismatch_pending && !!me.program_mismatch_extracted;
        setPending(isPending);
        setExtracted(me.program_mismatch_extracted ?? null);
        setCurrentProgramId(me.program_id ?? null);
        onPendingChangeRef.current?.(isPending);
      } else {
        setPending(false);
      }

      if (deptRes.ok) {
        const depts = (await deptRes.json()) as DepartmentOption[];
        if (!cancelled) setDepartments(depts);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentDept = departments.find((d) => d.id === currentProgramId);
  const extractedRecognized = extracted
    ? departments.some(
        (d) =>
          d.code.toLowerCase() === extracted.toLowerCase() ||
          d.name.toLowerCase() === extracted.toLowerCase(),
      )
    : false;

  const resolve = async (body: { action: string; program_id?: string }) => {
    setResolving(true);
    try {
      const token = await getTokenRef.current();
      if (!token) return;
      const res = await fetchWithClerkAuth("/api/me/program/resolve-mismatch", token, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setPending(false);
        setExtracted(null);
        onPendingChangeRef.current?.(false);
        onResolvedRef.current?.();
        toast.success("Program updated successfully.");
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.detail ?? "Failed to resolve program mismatch.");
      }
    } catch {
      toast.error("Failed to resolve program mismatch. Please try again.");
    } finally {
      setResolving(false);
    }
  };

  if (pending !== true || !extracted) return null;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
      <div className="flex flex-1 flex-col gap-3">
        {extractedRecognized ? (
          <div>
            <p className="text-sm font-medium text-amber-900">
              Your admission form indicates <strong>{extracted}</strong>, but your enrolled
              program is <strong>{currentDept?.code ?? "not set"}</strong>.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Updating your program will change your assigned adviser and required documents.
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-amber-900">
              We couldn't match the program on your admission form (found:{" "}
              <strong>"{extracted}"</strong>). Please select your correct program.
            </p>
            <p className="mt-1 text-xs text-amber-700">
              Choosing the wrong program will change your assigned adviser and required documents.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {extractedRecognized ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-400 text-amber-800 hover:bg-amber-100"
                disabled={resolving}
                onClick={() => resolve({ action: "keep_current" })}
              >
                {resolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Keep {currentDept?.code ?? "current"}, the form was a mistake
              </Button>
              <Button
                size="sm"
                className="bg-amber-600 text-white hover:bg-amber-700"
                disabled={resolving}
                onClick={() => resolve({ action: "confirm_extracted" })}
              >
                Update to {extracted}, my program changed
              </Button>
            </>
          ) : (
            <>
              {currentDept && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-400 text-amber-800 hover:bg-amber-100"
                  disabled={resolving}
                  onClick={() => resolve({ action: "keep_current" })}
                >
                  {resolving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Keep {currentDept.code}, the form was a mistake
                </Button>
              )}
              <Select
                disabled={resolving}
                onValueChange={(value) => resolve({ action: "confirm_extracted", program_id: value })}
              >
                <SelectTrigger className="w-full max-w-xs bg-white border-amber-300 focus:border-amber-500 focus:ring-amber-500">
                  <SelectValue placeholder="Select your correct program..." />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((dept) => (
                    <SelectItem key={dept.id} value={dept.id}>
                      {dept.code} — {dept.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
