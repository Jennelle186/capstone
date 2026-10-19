"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownToLine, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, GripVertical, PenLine, Plus, Settings2, Table2, Trash2, Type } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { createFieldBlock, createParagraphBlock, createSignatureBlock, createTableBlock, textStyleToCss } from "@/lib/formLayout";
import { ParagraphBlockCard, SignatureBlockCard, TableBlockCard, UnresolvedBlockCard } from "./BlockEditors";
import FieldConfigDialog from "./FieldConfigDialog";
import type { FieldNodeAttrs } from "@/types/form";
import type { FieldBlock, FormBlock, FormLayoutSection } from "@/types/formLayout";

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
    dragHandle?: {
        attributes: DraggableAttributes;
        listeners: DraggableSyntheticListeners;
    } | null;
    selectedIds: Set<string>;
    onSelectField: (id: string, additive: boolean) => void;
    /** Field keys already used anywhere in the form (cross-section duplicate guard). */
    usedFieldKeys: string[];
}

export default function SectionCard({
    section,
    index,
    canMoveUp,
    canMoveDown,
    onChange,
    onRemove,
    onMove,
    dragHandle,
    selectedIds,
    onSelectField,
    usedFieldKeys,
}: SectionCardProps) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingField, setEditingField] = useState<FieldBlock | null>(null);

    const blocks = section.blocks ?? [];
    const blockIds = blocks.map((b) => b.id);

    const openAdd = () => {
        setEditingField(null);
        setDialogOpen(true);
    };
    const openEdit = (field: FieldBlock) => {
        setEditingField(field);
        setDialogOpen(true);
    };

    const handleSubmit = (attrs: Omit<FieldNodeAttrs, "field_key">) => {
        if (editingField) {
            onChange({
                ...section,
                blocks: (section.blocks ?? []).map((b) =>
                    b.type === "field" && b.id === editingField.id ? { ...b, ...attrs } : b,
                ),
            });
        } else {
            onChange({ ...section, blocks: [...(section.blocks ?? []), createFieldBlock(attrs)] });
        }
    };

    const removeBlock = (id: string) =>
        onChange({ ...section, blocks: (section.blocks ?? []).filter((b) => b.id !== id) });

    const updateBlock = (id: string, patch: object) =>
        onChange({
            ...section,
            blocks: (section.blocks ?? []).map((b) => (b.id === id ? ({ ...b, ...patch } as FormBlock) : b)),
        });

    const addParagraph = () =>
        onChange({ ...section, blocks: [...(section.blocks ?? []), createParagraphBlock()] });
    const addTable = () =>
        onChange({ ...section, blocks: [...(section.blocks ?? []), createTableBlock()] });
    const addSignature = () =>
        onChange({ ...section, blocks: [...(section.blocks ?? []), createSignatureBlock()] });

    const resolveUnresolved = (id: string, fieldKey: string, label: string) =>
        onChange({
            ...section,
            blocks: (section.blocks ?? []).map((b) =>
                b.id === id
                    ? {
                          type: "field" as const,
                          id: b.id,
                          field_key: fieldKey,
                          label,
                          ui_component: "text_input" as const,
                          required: false,
                          options: null,
                          columnSpan: 1,
                          pageBreakBefore: false,
                          style: null,
                      }
                    : b,
            ),
        });

    const moveField = (id: string, direction: -1 | 1) => {
        const blocksArr = section.blocks ?? [];
        const fieldIndices = blocksArr
            .map((b, i) => (b.type === "field" ? i : -1))
            .filter((i) => i >= 0);
        const pos = fieldIndices.findIndex((i) => (blocksArr[i] as FieldBlock).id === id);
        if (pos < 0) return;
        const target = pos + direction;
        if (target < 0 || target >= fieldIndices.length) return;
        const from = fieldIndices[pos];
        const to = fieldIndices[target];
        const next = [...blocksArr];
        [next[from], next[to]] = [next[to], next[from]];
        onChange({ ...section, blocks: next });
    };

    return (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/50 p-3">
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="h-8 w-6 shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                    title="Drag to reorder section"
                    {...dragHandle?.attributes}
                    {...dragHandle?.listeners}
                >
                    <GripVertical className="h-4 w-4" />
                </button>
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

            <SortableContext items={blockIds} strategy={rectSortingStrategy}>
                <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
                    {blocks.map((block) => {
                        const isSelected = selectedIds.has(block.id);
                        const onSelect = (additive: boolean) => onSelectField(block.id, additive);
                        const span = block.type === "field" ? (block.columnSpan ?? 1) : 2;
                        const spanClass = span >= 2 ? "col-span-2" : "";
                        switch (block.type) {
                            case "field":
                                return (
                                    <div key={block.id} className={spanClass}>
                                        <SortableField
                                            field={block}
                                            isSelected={isSelected}
                                            onSelect={onSelect}
                                            onEdit={() => openEdit(block)}
                                            onDelete={() => removeBlock(block.id)}
                                            onMove={(dir) => moveField(block.id, dir)}
                                            onColumnSpanChange={(value) =>
                                                onChange({
                                                    ...section,
                                                    blocks: (section.blocks ?? []).map((b) =>
                                                        b.type === "field" && b.id === block.id
                                                            ? { ...b, columnSpan: value }
                                                            : b,
                                                    ),
                                                })
                                            }
                                            onPageBreakChange={(value) =>
                                                onChange({
                                                    ...section,
                                                    blocks: (section.blocks ?? []).map((b) =>
                                                        b.id === block.id ? ({ ...b, pageBreakBefore: value } as FormBlock) : b,
                                                    ),
                                                })
                                            }
                                        />
                                    </div>
                                );
                            case "paragraph":
                                return (
                                    <ParagraphBlockCard
                                        key={block.id}
                                        block={block}
                                        isSelected={isSelected}
                                        onSelect={onSelect}
                                        onDelete={() => removeBlock(block.id)}
                                        onChange={(patch) => updateBlock(block.id, patch)}
                                    />
                                );
                            case "table":
                                return (
                                    <TableBlockCard
                                        key={block.id}
                                        block={block}
                                        isSelected={isSelected}
                                        onSelect={onSelect}
                                        onDelete={() => removeBlock(block.id)}
                                        onChange={(patch) => updateBlock(block.id, patch)}
                                    />
                                );
                            case "signature":
                                return (
                                    <SignatureBlockCard
                                        key={block.id}
                                        block={block}
                                        isSelected={isSelected}
                                        onSelect={onSelect}
                                        onDelete={() => removeBlock(block.id)}
                                        onChange={(patch) => updateBlock(block.id, patch)}
                                    />
                                );
                            case "unresolved_field":
                                return (
                                    <UnresolvedBlockCard
                                        key={block.id}
                                        block={block}
                                        isSelected={isSelected}
                                        onSelect={onSelect}
                                        onDelete={() => removeBlock(block.id)}
                                        onResolve={(fieldKey, label) => resolveUnresolved(block.id, fieldKey, label)}
                                        usedFieldKeys={usedFieldKeys}
                                    />
                                );
                            default:
                                return null;
                        }
                    })}
                </div>
            </SortableContext>

            <div className="mt-3 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={openAdd}
                    className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-primary/50 hover:text-primary"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Field
                </button>
                <button
                    type="button"
                    onClick={addParagraph}
                    className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-primary/50 hover:text-primary"
                >
                    <Type className="h-3.5 w-3.5" />
                    Paragraph
                </button>
                <button
                    type="button"
                    onClick={addTable}
                    className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-primary/50 hover:text-primary"
                >
                    <Table2 className="h-3.5 w-3.5" />
                    Table
                </button>
                <button
                    type="button"
                    onClick={addSignature}
                    className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 transition-colors hover:border-primary/50 hover:text-primary"
                >
                    <PenLine className="h-3.5 w-3.5" />
                    Signature
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

function SortableField({
    field,
    isSelected,
    onSelect,
    onEdit,
    onDelete,
    onMove,
    onColumnSpanChange,
    onPageBreakChange,
}: {
    field: FieldBlock;
    isSelected: boolean;
    onSelect: (additive: boolean) => void;
    onEdit: () => void;
    onDelete: () => void;
    onMove: (direction: -1 | 1) => void;
    onColumnSpanChange: (value: number) => void;
    onPageBreakChange: (value: boolean) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => onSelect(e.shiftKey || e.ctrlKey || e.metaKey)}
            className={`group relative rounded-md border border-dashed border-slate-300 bg-white px-2 py-2 ${
                isSelected ? "ring-2 ring-primary ring-offset-1" : ""
            } ${isDragging ? "opacity-50" : ""}`}
        >
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="h-6 w-4 shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                    title="Drag to reorder field"
                    onClick={(e) => e.stopPropagation()}
                    {...attributes}
                    {...listeners}
                >
                    <GripVertical className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-0 flex-1">
                    <div
                        className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-700"
                        style={textStyleToCss(field.style)}
                    >
                        {field.label}
                        {field.required && <span className="ml-0.5 text-primary">*</span>}
                    </div>
                    <div className="text-[10px] text-slate-400">{TYPE_LABELS[field.ui_component] ?? field.ui_component}</div>
                </div>
                <div
                    className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Select
                        value={String(field.columnSpan ?? 1)}
                        onValueChange={(value) => onColumnSpanChange(Number(value))}
                    >
                        <SelectTrigger className="h-6 w-[74px] text-[10px]" title="Column span">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 col</SelectItem>
                            <SelectItem value="2">Full width</SelectItem>
                        </SelectContent>
                    </Select>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={`h-6 w-6 ${field.pageBreakBefore ? "text-primary" : "text-slate-400"}`}
                        title={field.pageBreakBefore ? "Page break before this field (on)" : "Start this field on a new page"}
                        onClick={() => onPageBreakChange(!field.pageBreakBefore)}
                    >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400"
                        title="Move earlier"
                        onClick={() => onMove(-1)}
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400"
                        title="Move later"
                        onClick={() => onMove(1)}
                    >
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400"
                        title="Edit field"
                        onClick={onEdit}
                    >
                        <Settings2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-slate-400 hover:text-red-600"
                        title="Delete field"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
