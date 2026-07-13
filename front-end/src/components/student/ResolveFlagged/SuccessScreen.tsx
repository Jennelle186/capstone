"use client";

import { FolderCheck } from "lucide-react";

interface SuccessScreenProps {
  documentTypeName: string;
  onDashboard: () => void;
}

export default function SuccessScreen({ documentTypeName, onDashboard }: SuccessScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
        <FolderCheck className="h-8 w-8" />
      </div>
      <h2 className="text-xl font-bold text-slate-900">
        Document Resolved!
      </h2>
      <p className="max-w-md text-sm leading-relaxed text-slate-500">
        {documentTypeName} has been successfully re-uploaded and submitted
        for adviser review.
      </p>
      <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={onDashboard}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98]"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
}
