"use client";

import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Plus, Settings2, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createField } from "@/lib/formLayout";
import FieldConfigDialog from "./FieldConfigDialog";
import type { FieldNodeAttrs } from "@/types/form";
import type { FormFieldSpec, FormLayoutSection } from "@/types/formLayout";

const TYPE_LABELS: Record<string, string> = {
    text_input: "Text",
    radio_group: "Radio",
    checkbox_group: "Checkbox",
    dropdown: "Dropdown",
    date_picker: "Date",
};

interface SectionCardProps {
    section: FormLayoutSection;
    index: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onChange: (next: FormLayoutSection) => void;
    onRemove: () => void;
    onMove: (direction: -1 | 1) => void;
}

export default function SectionCard({
    section,
    index,
    canMoveUp,
    canMoveDown,
    onChange,
    onRemove,
    onMove,
}: SectionCardProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingField, setEditingField] = useState<FormFieldSpec | null>(null);

    const openAdd = () => {
        setEditingField(null);
        setDialogOpen(true);
    };
    const openEdit = (field: FormFieldSpec) => {
        setEditingField(field);
        setDialogOpen(true);
    };

    const handleSubmit = (attrs: Omit<FieldNodeAttrs, "field_key">) => {
        if (editingField) {
            onChange({
                ...section,
                fields: section.fields.map((f) => (f.id === editingField.id ? { ...f, ...attrs } : f)),
            });
        } else {
            onChange({ ...section, fields: [...section.fields, createField(attrs)] });
        }
    };

    const removeField = (id: string) =>
        onChange({ ...section, fields: section.fields.filter((f) => f.id !== id) });

    const moveField = (id: string, direction: -1 | 1) => {
        const from = section.fields.findIndex((f) => f.id === id);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= section.fields.length) return;
        const fields = [...section.fields];
        [fields[from], fields[to]] = [fields[to], fields[from]];
        onChange({ ...section, fields });
    };

    return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-3">
            <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-primary/10 text-[11px] font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                </span>
                <Input
                    value={section.heading}
                    onChange={(e) => onChange({ ...section, heading: e.target.value })}
                    className="h-8 flex-1 font-semibold"
                    placeholder="Section heading"
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400"
                    title="Move section up"
                    disabled={!canMoveUp}
                    onClick={() => onMove(-1)}
                >
                    <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400"
                    title="Move section down"
                    disabled={!canMoveDown}
                    onClick={() => onMove(1)}
                >
                    <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-600"
                    title="Delete section"
                    onClick={onRemove}
                >
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
                {section.fields.map((field) => (
                    <div
                        key={field.id}
                        className="group relative rounded-md border border-dashed border-slate-300 bg-white px-3 py-2"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                                <div className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-700">
                                    {field.label}
                                    {field.required && <span className="ml-0.5 text-primary">*</span>}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                    {TYPE_LABELS[field.ui_component] ?? field.ui_component}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400"
                                    title="Move earlier"
                                    onClick={() => moveField(field.id, -1)}
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400"
                                    title="Move later"
                                    onClick={() => moveField(field.id, 1)}
                                >
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400"
                                    title="Edit field"
                                    onClick={() => openEdit(field)}
                                >
                                    <Settings2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-slate-400 hover:text-red-600"
                                    title="Delete field"
                                    onClick={() => removeField(field.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}

                <button
                    type="button"
                    onClick={openAdd}
                    className="flex min-h-[54px] items-center justify-center gap-1.5 rounded-md border border-dashed border-slate-300 text-xs text-slate-400 transition-colors hover:border-primary/50 hover:text-primary"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add field
                </button>
            </div>

            <FieldConfigDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                initial={editingField}
                onSubmit={handleSubmit}
            />
        </div>
    );
}
