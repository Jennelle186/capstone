"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FormRecord } from "@/types/form";

interface FormListProps {
    forms: FormRecord[];
    selectedId: string | null;
    onSelect: (form: FormRecord) => void;
    onDelete: (id: string) => void;
    onCreate: () => void;
}

export default function FormList({ forms, selectedId, onSelect, onDelete, onCreate }: FormListProps) {
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Forms</h2>
                <Button size="sm" onClick={onCreate} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    New
                </Button>
            </div>

            {forms.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                    No forms yet. Create one to get started.
                </p>
            ) : (
                <ul className="space-y-2">
                    {forms.map((form) => (
                        <li key={form.id}>
                            <div
                                className={`group flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${
                                    selectedId === form.id
                                        ? "border-primary bg-primary/5"
                                        : "border-slate-200 bg-white hover:border-slate-300"
                                }`}
                                onClick={() => onSelect(form)}
                            >
                                <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-slate-900">{form.name}</p>
                                    <p className="truncate text-xs text-slate-500">
                                        {form.description || "No description"}
                                    </p>
                                </div>
                                {form.extraction_schema_id && (
                                    <Badge variant="secondary" className="shrink-0">
                                        schema
                                    </Badge>
                                )}
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-600"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setPendingDeleteId(form.id);
                                    }}
                                    type="button"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            <AlertDialog
                open={pendingDeleteId !== null}
                onOpenChange={(open) => {
                    if (!open) setPendingDeleteId(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this form?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently removes the form and its layout. This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 text-white hover:bg-red-700"
                            onClick={() => {
                                if (pendingDeleteId) onDelete(pendingDeleteId);
                                setPendingDeleteId(null);
                            }}
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
