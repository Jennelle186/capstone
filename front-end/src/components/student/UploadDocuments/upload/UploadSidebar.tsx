"use client";

import { CheckCircle, Lightbulb, ArrowRight, ClipboardList, FileText } from "lucide-react";
import type { RequiredDocument } from "@/types/student";

interface UploadSidebarProps {
  requiredDocuments?: RequiredDocument[];
}

export default function UploadSidebar({ requiredDocuments }: UploadSidebarProps) {
  return (
    <div className="col-span-12 lg:col-span-4 space-y-4">
      {requiredDocuments && requiredDocuments.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">
              Required Documents
            </h4>
          </div>
          <ul className="space-y-2">
            {requiredDocuments.map((doc) => (
              <li key={doc.id} className="flex items-center gap-2 text-sm text-slate-700">
                {doc.is_required ? (
                  <span className="text-red-500 font-bold text-base leading-none">*</span>
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
                )}
                <span>{doc.name}</span>
                {!doc.is_required && (
                  <span className="text-xs text-slate-400 ml-auto">Optional</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-200">
        <div className="flex items-center gap-2 mb-3">
          <Lightbulb className="h-5 w-5 text-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Upload Tips</h4>
        </div>
        <ul className="space-y-3">
          {[
            "Ensure documents are well-lit and all four corners are visible.",
            "High-resolution scans lead to faster verification times.",
            "Avoid glare on laminated surfaces when using photography.",
          ].map((tip) => (
            <li key={tip} className="flex gap-3">
              <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-slate-600">{tip}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="relative z-10">
          <h4 className="text-base font-semibold text-slate-900 mb-2">Academic Trust</h4>
          <p className="text-sm text-slate-500 mb-4">
            Our systems utilize encryption to ensure your personal data remains secure
            throughout the verification process.
          </p>
          <a
            href="#"
            className="text-xs font-semibold text-primary flex items-center gap-1 hover:gap-2 transition-all"
          >
            View Privacy Policy
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12">
          <FileText className="h-28 w-28 text-primary" />
        </div>
      </div>
    </div>
  );
}
