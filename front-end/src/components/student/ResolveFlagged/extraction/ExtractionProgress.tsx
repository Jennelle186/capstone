"use client";

import { Loader2, Database } from "lucide-react";

interface ExtractionProgressProps {
  state: "checking" | "extracting";
  progress: number;
}

export default function ExtractionProgress({ state, progress }: ExtractionProgressProps) {
  if (state === "checking") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-4">
          <Database className="h-8 w-8 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Checking extraction requirements...
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              Determining if this document needs data extraction.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-6">
      <div className="flex items-center gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <div>
          <p className="text-sm font-semibold text-blue-900">
            Extracting data from document...
          </p>
          <p className="mt-0.5 text-xs text-blue-700">
            Reading fields and values from the file.
          </p>
        </div>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-blue-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all duration-500"
          style={{ width: `${Math.max(10, progress)}%` }}
        />
      </div>
    </div>
  );
}
