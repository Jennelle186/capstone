"use client";

import { CheckCircle, ClipboardList, ChevronRight, FileText, Lightbulb } from "lucide-react";
import type { SlotStatusResponse } from "@/types/requirement";
import { getSlotDisplayName } from "@/types/requirement";

interface UploadSidebarProps {
    slots?: SlotStatusResponse[];
    legacyDocuments?: { id: string; name: string; code: string; is_required: boolean }[];
}

export default function UploadSidebar({ slots, legacyDocuments }: UploadSidebarProps) {
    const hasSlots = slots && slots.length > 0;
    const showLegacy = !hasSlots && legacyDocuments && legacyDocuments.length > 0;

    return (
        <div className="col-span-12 lg:col-span-4 space-y-4">
            {(hasSlots || showLegacy) && (
                <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <ClipboardList className="h-5 w-5 text-primary" />
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">
                            Required Documents
                        </h4>
                    </div>
                    <ul className="space-y-2.5">
                        {hasSlots &&
                            slots.map((slot) => (
                                <li key={slot.id} className="text-sm text-slate-700">
                                    {slot.slot_type === "group" ? (
                                        <div>
                                            <div className="flex items-center gap-2 font-medium">
                                                {slot.is_complete ? (
                                                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                                                ) : (
                                                    <span className="text-red-500 font-bold text-base leading-none shrink-0">
                                                        *
                                                    </span>
                                                )}
                                                <span>{getSlotDisplayName(slot)}</span>
                                                {!slot.is_complete && (
                                                    <span className="ml-auto text-[11px] font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5 whitespace-nowrap">
                                                        {slot.matched_count}/{slot.min_required} required
                                                    </span>
                                                )}
                                        {slot.is_complete && (
                                            <span className="ml-auto text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 whitespace-nowrap">
                                                Complete
                                            </span>
                                        )}
                                    </div>
                                    {slot.is_complete && (
                                        <p className="mt-1 text-[11px] text-amber-600 bg-amber-50/50 rounded-md px-2 py-0.5">
                                            Requirement fulfilled — new uploads add alternate copies.
                                        </p>
                                    )}
                                    {!slot.is_complete && (
                                        <p className="mt-1 text-xs text-slate-400">
                                            Submit any {slot.min_required} of:{" "}
                                            {slot.items.map((i) => i.document_type_name).join(", ")}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    {slot.is_complete ? (
                                        <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                                    ) : (
                                        <span className="text-red-500 font-bold text-base leading-none shrink-0">
                                            *
                                        </span>
                                    )}
                                    <span>{getSlotDisplayName(slot)}</span>
                                    {slot.is_complete && (
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 ml-auto" />
                                    )}
                                </div>
                                    )}
                                </li>
                            ))}
                        {showLegacy &&
                            legacyDocuments.map((doc) => (
                                <li key={doc.id} className="flex items-center gap-2 text-sm text-slate-700">
                                    <span className="text-red-500 font-bold text-base leading-none">*</span>
                                    <span>{doc.name}</span>
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
                        <ChevronRight className="h-3.5 w-3.5" />
                    </a>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12">
                    <FileText className="h-28 w-28 text-primary" />
                </div>
            </div>
        </div>
    );
}
