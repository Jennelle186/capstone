"use client";

import {
    CheckCircle,
    AlertTriangle,
    Loader2,
    Clock,
    FileText,
    FileSearch2,
    FileBadge2,
    FileCheck2,
    ClipboardList,
    GraduationCap,
    ChevronDown,
    Layers,
} from "lucide-react";
import type { ComponentType } from "react";
import { useState } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ClassificationItem } from "@/types/classification";
import type { SlotStatusResponse } from "@/types/requirement";

interface SubmissionChecklistProps {
    requiredSlots: SlotStatusResponse[];
    items: ClassificationItem[];
}

type RowStatus = "not-uploaded" | "pending" | "processing" | "classified" | "needs-review" | "submitted" | "verified";

interface SlotRow {
    slot: SlotStatusResponse;
    status: RowStatus;
    matchedFileName: string | null;
    matchedConfidence: number | null;
}

const CODE_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
    ADMISSION_FORM: ClipboardList,
    CET: FileSearch2,
    REPORT_CARD: GraduationCap,
    GOOD_MORAL: FileCheck2,
    BIRTH_CERT: FileBadge2,
    MED_CERT: FileText,
};

const STATUS_PRIORITY: Record<RowStatus, number> = {
    verified: 6,
    submitted: 5,
    classified: 4,
    "needs-review": 3,
    processing: 2,
    pending: 1,
    "not-uploaded": 0,
};

function deriveRowStatus(item: ClassificationItem): RowStatus {
    if (item.status === "verified") return "verified";
    if (item.status === "overridden") return "classified";
    if (item.originalStatus === "submitted" || item.originalStatus === "in-review") return "submitted";
    if (item.status === "classified" && !item.needsReview) return "classified";
    if (item.status === "needs-review" || item.status === "flagged") return "needs-review";
    if (item.status === "processing") return "processing";
    if (item.status === "pending") return "pending";
    return "pending";
}

function buildSlotRows(slots: SlotStatusResponse[], items: ClassificationItem[]): SlotRow[] {
    return slots.map((slot) => {
        const slotDocIds = new Set(slot.items.map((i) => i.document_type_id));
        const matched = items.filter(
            (i) => i.documentTypeId && slotDocIds.has(i.documentTypeId),
        );

        if (matched.length === 0) {
            return { slot, status: "not-uploaded", matchedFileName: null, matchedConfidence: null };
        }

        const best = matched.sort((a, b) => {
            const pa = STATUS_PRIORITY[deriveRowStatus(a)];
            const pb = STATUS_PRIORITY[deriveRowStatus(b)];
            return pb - pa;
        })[0];

        return {
            slot,
            status: deriveRowStatus(best),
            matchedFileName: best.fileName,
            matchedConfidence: best.confidence,
        };
    });
}

function StatusIcon({ status }: { status: RowStatus }) {
    switch (status) {
        case "verified":
            return <CheckCircle className="h-4 w-4 text-emerald-600" />;
        case "submitted":
            return <CheckCircle className="h-4 w-4 text-slate-500" />;
        case "classified":
            return <CheckCircle className="h-4 w-4 text-emerald-600" />;
        case "needs-review":
            return <AlertTriangle className="h-4 w-4 text-amber-500" />;
        case "processing":
            return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
        case "pending":
            return <Clock className="h-4 w-4 text-amber-500" />;
        case "not-uploaded":
            return <FileText className="h-4 w-4 text-slate-300" />;
    }
}

function StatusLabel({
    status,
    confidence,
    fileName,
}: {
    status: RowStatus;
    confidence: number | null;
    fileName: string | null;
}) {
    switch (status) {
        case "verified":
            return (
                <div className="flex flex-col">
                    <span className="text-xs font-semibold text-emerald-600">Verified by Adviser</span>
                    {fileName && (
                        <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>
                    )}
                </div>
            );
        case "submitted":
            return (
                <div className="flex flex-col">
                    <span className="text-xs font-semibold text-slate-600">Submitted for review</span>
                    {fileName && (
                        <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>
                    )}
                </div>
            );
        case "classified":
            return (
                <div className="flex flex-col">
                    <span className="text-xs font-semibold text-emerald-600">
                        Classified{confidence !== null ? ` \u2014 ${confidence}%` : ""}
                    </span>
                    {fileName && (
                        <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>
                    )}
                </div>
            );
        case "needs-review":
            return (
                <div className="flex flex-col">
                    <span className="text-xs font-semibold text-amber-600">
                        Needs review{confidence !== null ? ` \u2014 ${confidence}%` : ""}
                    </span>
                    {fileName && (
                        <span className="text-[11px] text-slate-400 truncate max-w-[160px]">{fileName}</span>
                    )}
                </div>
            );
        case "processing":
            return <span className="text-xs font-semibold text-blue-600">Processing\u2026</span>;
        case "pending":
            return <span className="text-xs font-semibold text-amber-600">Pending classification</span>;
        case "not-uploaded":
            return <span className="text-xs text-slate-400">Not uploaded</span>;
    }
}

export default function SubmissionChecklist({ requiredSlots, items }: SubmissionChecklistProps) {
    const rows = buildSlotRows(requiredSlots, items);
    const completedCount = rows.filter(
        (r) => r.status === "verified" || r.status === "classified" || r.status === "submitted",
    ).length;
    const total = rows.length;
    const isMobile = useMediaQuery("(max-width: 767px)");
    const [isOpen, setIsOpen] = useState(true);

    return (
        <Card className="rounded-2xl border border-slate-200 shadow-sm">
            <Collapsible open={!isMobile || isOpen} onOpenChange={setIsOpen}>
                <CardHeader className="px-4 pt-4 pb-2">
                    {isMobile ? (
                        <CollapsibleTrigger asChild>
                            <button
                                type="button"
                                className="flex w-full items-center justify-between gap-2 text-left cursor-pointer"
                            >
                                <h3 className="text-sm font-semibold text-slate-900">Required Documents</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-500">
                                        {completedCount} of {total} complete
                                    </span>
                                    <ChevronDown
                                        className={cn(
                                            "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                                            isOpen && "rotate-180",
                                        )}
                                    />
                                </div>
                            </button>
                        </CollapsibleTrigger>
                    ) : (
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-slate-900">Required Documents</h3>
                            <span className="text-xs text-slate-500">
                                {completedCount} of {total} complete
                            </span>
                        </div>
                    )}
                </CardHeader>
                <CollapsibleContent>
                    <CardContent className="px-0 py-0">
                        <ul className="divide-y divide-slate-100">
                            {rows.map((row) => {
                                const primaryItem = row.slot.items[0];
                                const DocIcon = primaryItem
                                    ? CODE_ICON_MAP[primaryItem.document_type_code] ?? FileText
                                    : FileText;
                                const isComplete =
                                    row.status === "verified" ||
                                    row.status === "classified" ||
                                    row.status === "submitted";
                                const isMissing = row.status === "not-uploaded";
                                const isGroup = row.slot.slot_type === "group";

                                return (
                                    <li key={row.slot.id} className="flex items-center gap-3 px-4 py-3">
                                        <div
                                            className={cn(
                                                "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                                                isComplete && "bg-emerald-50",
                                                row.status === "submitted" && "bg-slate-100",
                                                row.status === "needs-review" && "bg-amber-50",
                                                row.status === "processing" && "bg-blue-50",
                                                row.status === "pending" && "bg-amber-50",
                                                isMissing && "bg-slate-50",
                                            )}
                                        >
                                            {isGroup ? (
                                                <Layers
                                                    className={cn(
                                                        "h-4 w-4",
                                                        isComplete && "text-emerald-600",
                                                        row.status === "submitted" && "text-slate-500",
                                                        row.status === "needs-review" && "text-amber-600",
                                                        isMissing && "text-slate-300",
                                                    )}
                                                />
                                            ) : (
                                                <DocIcon
                                                    className={cn(
                                                        "h-4 w-4",
                                                        isComplete && "text-emerald-600",
                                                        row.status === "submitted" && "text-slate-500",
                                                        row.status === "needs-review" && "text-amber-600",
                                                        row.status === "processing" && "text-blue-600",
                                                        row.status === "pending" && "text-amber-500",
                                                        isMissing && "text-slate-300",
                                                    )}
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p
                                                    className={cn(
                                                        "text-sm font-medium leading-tight",
                                                        isMissing ? "text-slate-400" : "text-slate-900",
                                                    )}
                                                >
                                                    {row.slot.slot_type === "group"
                                                        ? row.slot.group_name ?? "Requirement Group"
                                                        : primaryItem?.document_type_name ?? "Unknown"}
                                                </p>
                                                {isGroup && (
                                                    <span className="text-[11px] font-medium text-cyan-700 bg-cyan-50 rounded-full px-2 py-0.5 shrink-0">
                                                        {row.slot.min_required} of {row.slot.items.length} req.
                                                    </span>
                                                )}
                                            </div>
                                            {isGroup && (
                                                <p className="text-[11px] text-slate-400 mt-0.5">
                                                    {row.slot.items.map((i) => i.document_type_name).join(", ")}
                                                </p>
                                            )}
                                            <StatusLabel
                                                status={row.status}
                                                confidence={row.matchedConfidence}
                                                fileName={row.matchedFileName}
                                            />
                                        </div>
                                        <StatusIcon status={row.status} />
                                    </li>
                                );
                            })}
                        </ul>
                    </CardContent>
                    <CardFooter className="border-t px-4 py-3">
                        <p
                            className={cn(
                                "text-sm font-medium",
                                completedCount === total && total > 0 ? "text-emerald-600" : "text-slate-500",
                            )}
                        >
                            {completedCount === total && total > 0
                                ? `All ${total} requirements satisfied`
                                : `${completedCount} of ${total} requirements satisfied`}
                        </p>
                    </CardFooter>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
}
