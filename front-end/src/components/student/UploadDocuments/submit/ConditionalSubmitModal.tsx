"use client";

import * as React from "react";
import { AlertTriangle, X } from "lucide-react";
import type { SlotStatusResponse } from "@/types/requirement";
import { getSlotDisplayName } from "@/types/requirement";

interface ConditionalSubmitModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => void;
    incompleteSlots: SlotStatusResponse[];
    isSubmitting: boolean;
}

export default function ConditionalSubmitModal({
    open,
    onOpenChange,
    onConfirm,
    incompleteSlots,
    isSubmitting,
}: ConditionalSubmitModalProps) {
    const [acknowledged, setAcknowledged] = React.useState(false);

    React.useEffect(() => {
        if (open) setAcknowledged(false);
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="relative mx-4 max-w-md rounded-2xl bg-white p-6 shadow-xl">
                <button
                    type="button"
                    className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"
                    onClick={() => onOpenChange(false)}
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="flex items-center gap-3 mb-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-slate-900">
                            Missing Requirements
                        </h3>
                        <p className="text-sm text-slate-500">
                            {incompleteSlots.length} requirement{incompleteSlots.length !== 1 ? "s" : ""} not yet fulfilled
                        </p>
                    </div>
                </div>

                <p className="mb-4 text-sm text-slate-600">
                    You are about to submit your enrollment file with missing
                    requirements. You may proceed, but your application will be
                    marked as <strong className="text-amber-700">Pending Documents</strong>{" "}
                    and cannot be fully approved by an adviser until these are
                    uploaded.
                </p>

                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                        Still Needed
                    </p>
                    <ul className="space-y-1">
                        {incompleteSlots.map((slot) => (
                            <li key={slot.id} className="flex items-start gap-2 text-sm">
                                <span className="mt-0.5 shrink-0 text-amber-500">&bull;</span>
                  <span className="text-slate-700">
                    {getSlotDisplayName(slot)}
                    {slot.min_required > 1 && (
                                        <span className="ml-1 text-xs text-slate-400">
                                            ({slot.matched_count}/{slot.min_required})
                                        </span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                <label className="mb-5 flex items-start gap-2 text-sm text-slate-600 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={(e) => setAcknowledged(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span>
                        I acknowledge that I must upload my missing documents
                        later for adviser approval.
                    </span>
                </label>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => onOpenChange(false)}
                        className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setAcknowledged(false);
                            onConfirm();
                        }}
                        disabled={!acknowledged || isSubmitting}
                        className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? "Submitting..." : "Confirm Submission"}
                    </button>
                </div>
            </div>
        </div>
    );
}
