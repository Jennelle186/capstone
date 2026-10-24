"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchWithClerkAuth } from "@/lib/api";
import type { FormValues } from "@/types/form";
import FilledFormPreview from "./FilledFormPreview";

interface FilledFormData {
    form_id: string | null;
    form_name: string;
    document_json: unknown;
    values: FormValues;
}

interface Props {
    submissionId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    getToken: () => Promise<string | null>;
    currentIndex?: number;
    total?: number;
    onIndexChange?: (index: number) => void;
}

/** Detail/preview dialog for a document that was filled online (no file). */
export default function FilledFormDetailModal({
    submissionId,
    open,
    onOpenChange,
    getToken,
    currentIndex = 0,
    total = 1,
    onIndexChange,
}: Props) {
    const [data, setData] = React.useState<FilledFormData | null>(null);
    const [loading, setLoading] = React.useState(false);

    React.useEffect(() => {
        if (!open || !submissionId) return;
        let cancelled = false;
        setLoading(true);
        setData(null);
        void (async () => {
            try {
                const token = await getToken();
                if (!token) return;
                const res = await fetchWithClerkAuth(`/api/me/documents/${submissionId}/filled-form`, token);
                if (cancelled) return;
                if (res.ok) setData((await res.json()) as FilledFormData);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open, submissionId, getToken]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton={false}
                className="max-w-[calc(100%-1rem)] sm:max-w-3xl h-[90vh] p-0 gap-0 rounded-2xl overflow-hidden flex flex-col"
            >
                <DialogHeader className="px-5 py-3.5 border-b border-slate-200 flex flex-row items-center justify-between shrink-0 gap-3">
                    <div className="min-w-0">
                        <DialogTitle className="text-base font-semibold text-slate-900 truncate text-left">
                            {data?.form_name ?? "Filled form"}
                        </DialogTitle>
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-indigo-700 bg-indigo-100">
                            Filled online
                        </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {onIndexChange && total > 1 && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentIndex <= 0}
                                    onClick={() => onIndexChange(currentIndex - 1)}
                                    className="gap-1 text-xs h-8"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                    Previous
                                </Button>
                                <span className="text-xs font-medium text-slate-500 tabular-nums">
                                    {currentIndex + 1}/{total}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={currentIndex >= total - 1}
                                    onClick={() => onIndexChange(currentIndex + 1)}
                                    className="gap-1 text-xs h-8"
                                >
                                    Next
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                            </>
                        )}
                        <Button variant="ghost" size="icon" className="rounded-full hover:bg-slate-100" onClick={() => onOpenChange(false)}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto bg-slate-100 p-4 sm:p-6">
                    {loading ? (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                            Loading filled form…
                        </div>
                    ) : data ? (
                        <FilledFormPreview document_json={data.document_json} values={data.values} />
                    ) : (
                        <div className="flex h-full items-center justify-center text-sm text-slate-500">
                            This filled form is not available.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
