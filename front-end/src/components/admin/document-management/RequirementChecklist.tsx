import { motion } from "framer-motion";
import {
    CheckCircle2,
    ClipboardList,
    FileBadge2,
    FileCheck2,
    FileSearch2,
    GraduationCap,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DocumentTypeItem, StudentClassification } from "@/types/documentType";

interface RequirementChecklistProps {
    disabled?: boolean;
    items: DocumentTypeItem[];
    selectedIds: Set<string>;
    onToggle: (documentTypeId: string) => void;
    renderRowSuffix?: (item: DocumentTypeItem) => ReactNode;
}

const CODE_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
    ADMISSION_FORM: ClipboardList,
    CET: FileSearch2,
    REPORT_CARD: GraduationCap,
    GOOD_MORAL: FileCheck2,
    BIRTH_CERT: FileBadge2,
};

const CLASSIFICATION_LABELS: Record<StudentClassification, string> = {
    regular: "Regular",
    transferee: "Transferee",
    shiftee: "Shiftee",
};

function getDocumentIcon(code: string) {
    return CODE_ICON_MAP[code] ?? FileCheck2;
}

export default function RequirementChecklist({
    disabled = false,
    items,
    selectedIds,
    onToggle,
    renderRowSuffix,
}: RequirementChecklistProps) {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            {items.map((item, index) => {
                const checked = selectedIds.has(item.id);
                const Icon = getDocumentIcon(item.code);
                const classifications = item.applicableClassifications || [];

                return (
                    <motion.button
                        key={item.id}
                        type="button"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                        onClick={() => onToggle(item.id)}
                        disabled={disabled}
                        className={cn("text-left", disabled ? "cursor-not-allowed" : undefined)}
                    >
                        <Card
                            className={cn(
                                "transition-colors",
                                checked ? "border-emerald-300 bg-emerald-50/60" : undefined,
                                !checked && !disabled ? "hover:border-slate-300 hover:bg-slate-50/60" : undefined,
                                disabled ? "bg-muted/30 opacity-80" : undefined,
                            )}
                        >
                            <CardContent className="flex items-start justify-between gap-3 p-4">
                                <div className="flex items-start gap-3">
                                    <div className={cn(
                                        "rounded-md p-2",
                                        checked ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                                    )}>
                                        <Icon className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-medium text-foreground">{item.name}</p>
                                        <p className="text-sm text-muted-foreground">{item.description}</p>
                                        {classifications.length > 0 && (
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {classifications.map((classification) => (
                                                    <Badge key={classification} variant="outline" className="text-xs">
                                                        {CLASSIFICATION_LABELS[classification] || classification}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                        {renderRowSuffix?.(item)}
                                    </div>
                                </div>
                                <div className="pt-0.5">
                                    <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={disabled}
                                        onChange={() => onToggle(item.id)}
                                        className={cn(
                                            "h-4 w-4 accent-emerald-600",
                                            disabled ? "cursor-not-allowed" : "cursor-pointer",
                                        )}
                                        aria-label={`Toggle requirement for ${item.name}`}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    </motion.button>
                );
            })}
            {items.length > 0 ? (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, delay: 0.1 }}
                    className="md:col-span-2"
                >
                    <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        {selectedIds.size} document type{selectedIds.size === 1 ? "" : "s"} selected.
                    </p>
                </motion.div>
            ) : null}
        </div>
    );
}
