"use client";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDownToLine, Check, GripVertical, Minus, Plus, TableProperties, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ParagraphBlock, SignatureBlock, TableBlock, UnresolvedFieldBlock } from "@/types/formLayout";

interface BlockCardProps {
    isSelected: boolean;
    onSelect: (additive: boolean) => void;
    onDelete: () => void;
}

interface PageBreakControlProps {
    value: boolean | undefined;
    onChange: (value: boolean) => void;
}

function PageBreakControl({ value, onChange }: PageBreakControlProps) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`h-7 w-7 ${value ? "text-primary" : "text-slate-400 hover:text-slate-600"}`}
            title={value ? "Page break before this block (on)" : "Start this block on a new page"}
            onClick={(e) => {
                e.stopPropagation();
                onChange(!value);
            }}
        >
            <ArrowDownToLine className="h-3.5 w-3.5" />
        </Button>
    );
}

function useBlockSortable(id: string) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    return { attributes, listeners, setNodeRef, style: { transform: CSS.Transform.toString(transform), transition }, isDragging };
}

function DragHandle({
    attributes,
    listeners,
}: {
    attributes: DraggableAttributes;
    listeners: DraggableSyntheticListeners;
}) {
    return (
        <button
            type="button"
            className="h-6 w-4 shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            title="Drag to reorder"
            onClick={(e) => e.stopPropagation()}
            {...attributes}
            {...listeners}
        >
            <GripVertical className="h-3.5 w-3.5" />
        </button>
    );
}

function cardClass(isSelected: boolean, isDragging: boolean, extra = "") {
    return `group rounded-md border border-dashed border-slate-300 bg-white px-2 py-2 ${
        isSelected ? "ring-2 ring-primary ring-offset-1" : ""
    } ${isDragging ? "opacity-50" : ""} ${extra}`;
}

export function ParagraphBlockCard({
    block,
    isSelected,
    onSelect,
    onDelete,
    onChange,
}: BlockCardProps & { block: ParagraphBlock; onChange: (patch: Partial<ParagraphBlock>) => void }) {
    const { attributes, listeners, setNodeRef, style, isDragging } = useBlockSortable(block.id);
    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => onSelect(e.shiftKey || e.ctrlKey || e.metaKey)}
            className={cardClass(isSelected, isDragging, "col-span-2")}
        >
            <div className="flex items-start gap-2">
                <DragHandle attributes={attributes} listeners={listeners} />
                <Textarea
                    value={block.text}
                    onChange={(e) => onChange({ text: e.target.value })}
                    className="min-h-[48px] flex-1 resize-none text-xs"
                    placeholder="Paragraph text…"
                />
                <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <PageBreakControl
                        value={block.pageBreakBefore}
                        onChange={(value) => onChange({ pageBreakBefore: value })}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        title="Delete paragraph"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function TableBlockCard({
    block,
    isSelected,
    onSelect,
    onDelete,
    onChange,
}: BlockCardProps & { block: TableBlock; onChange: (patch: Partial<TableBlock>) => void }) {
    const { attributes, listeners, setNodeRef, style, isDragging } = useBlockSortable(block.id);
    const columns = block.columns;
    const widths = block.columnWidths ?? [];

    const setCell = (r: number, c: number, value: string) => {
        const rows = block.rows.map((row, ri) => (ri === r ? row.map((cell, ci) => (ci === c ? value : cell)) : row));
        onChange({ rows });
    };
    const addRow = () => onChange({ rows: [...block.rows, Array(columns).fill("")] });
    const removeRow = () => onChange({ rows: block.rows.slice(0, -1) });

    const setWidth = (index: number, value: string) => {
        const next = Array.from({ length: columns }, (_, i) => (i === index ? value : (widths[i] ?? "")));
        onChange({ columnWidths: next.some((w) => w.trim()) ? next : null });
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => onSelect(e.shiftKey || e.ctrlKey || e.metaKey)}
            className={cardClass(isSelected, isDragging, "col-span-2")}
        >
            <div className="flex flex-wrap items-center gap-2">
                <DragHandle attributes={attributes} listeners={listeners} />
                <span className="text-[11px] font-semibold text-slate-600">Table</span>
                <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">Cols</span>
                    <Input
                        type="number"
                        min={1}
                        max={12}
                        value={columns}
                        onChange={(e) =>
                            onChange({
                                columns: Math.max(1, Math.min(12, Number(e.target.value) || 1)),
                                columnWidths: null,
                            })
                        }
                        className="h-7 w-14 text-xs"
                    />
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-7 gap-1 text-xs ${block.headerRow ? "text-primary" : "text-slate-500"}`}
                    title="Treat the first row as a repeating table header"
                    onClick={(e) => {
                        e.stopPropagation();
                        onChange({ headerRow: !block.headerRow });
                    }}
                >
                    <TableProperties className="h-3.5 w-3.5" />
                    Header
                </Button>
                <div className="flex-1" />
                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <PageBreakControl
                        value={block.pageBreakBefore}
                        onChange={(value) => onChange({ pageBreakBefore: value })}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-slate-500"
                        onClick={addRow}
                    >
                        <Plus className="h-3.5 w-3.5" /> Row
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs text-slate-500"
                        onClick={removeRow}
                    >
                        <Minus className="h-3.5 w-3.5" /> Row
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        title="Delete table"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            {block.rows.length === 0 ? (
                <p className="mt-2 text-[11px] italic text-slate-300">No rows yet — add a row.</p>
            ) : (
                <table className="mt-2 w-full border-collapse">
                    <tbody>
                        {block.rows.map((row, r) => (
                            <tr key={r}>
                                {Array.from({ length: columns }).map((_, c) => (
                                    <td
                                        key={c}
                                        className={`border border-slate-200 p-0.5 ${
                                            block.headerRow && r === 0 ? "bg-slate-50" : ""
                                        }`}
                                    >
                                        <Input
                                            value={row[c] ?? ""}
                                            onChange={(e) => setCell(r, c, e.target.value)}
                                            className="h-7 rounded-none border-0 text-xs shadow-none"
                                        />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <div className="mt-1.5 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <span className="shrink-0 text-[10px] text-slate-400">Widths</span>
                {Array.from({ length: columns }).map((_, c) => (
                    <Input
                        key={c}
                        value={widths[c] ?? ""}
                        onChange={(e) => setWidth(c, e.target.value)}
                        placeholder="auto"
                        className="h-6 w-16 text-[10px]"
                        title={`Column ${c + 1} width (e.g. 30% or 40mm)`}
                    />
                ))}
            </div>
        </div>
    );
}

export function SignatureBlockCard({
    block,
    isSelected,
    onSelect,
    onDelete,
    onChange,
}: BlockCardProps & { block: SignatureBlock; onChange: (patch: Partial<SignatureBlock>) => void }) {
    const { attributes, listeners, setNodeRef, style, isDragging } = useBlockSortable(block.id);
    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => onSelect(e.shiftKey || e.ctrlKey || e.metaKey)}
            className={cardClass(isSelected, isDragging, "col-span-2")}
        >
            <div className="flex items-center gap-2">
                <DragHandle attributes={attributes} listeners={listeners} />
                <div className="min-w-0 flex-1">
                    <div className="h-6 border-b border-slate-300" />
                    <Input
                        value={block.label}
                        onChange={(e) => onChange({ label: e.target.value })}
                        className="mt-1 h-6 border-0 px-0 text-[10px] uppercase tracking-[0.08em] text-slate-500 shadow-none focus-visible:ring-0"
                        placeholder="Signature label"
                    />
                </div>
                <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <PageBreakControl
                        value={block.pageBreakBefore}
                        onChange={(value) => onChange({ pageBreakBefore: value })}
                    />
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-400 hover:text-red-600"
                        title="Delete signature"
                        onClick={onDelete}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
        </div>
    );
}

export function UnresolvedBlockCard({
    block,
    isSelected,
    onSelect,
    onDelete,
    onResolve,
    usedFieldKeys,
}: BlockCardProps & {
    block: UnresolvedFieldBlock;
    onResolve: (fieldKey: string, label: string) => void;
    usedFieldKeys: string[];
}) {
    const { attributes, listeners, setNodeRef, style, isDragging } = useBlockSortable(block.id);
    const [fieldKey, setFieldKey] = useState(block.field_key);
    const [label, setLabel] = useState(block.label);

    const normalizedKey = fieldKey.trim().toLowerCase().replace(/\s+/g, "_");
    const duplicate = usedFieldKeys.includes(normalizedKey);
    const canResolve = normalizedKey.length > 0 && !duplicate;

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={(e) => onSelect(e.shiftKey || e.ctrlKey || e.metaKey)}
            className={`col-span-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-2 ${
                isSelected ? "ring-2 ring-amber-500 ring-offset-1" : ""
            } ${isDragging ? "opacity-50" : ""}`}
        >
            <div className="flex items-center gap-2">
                <DragHandle attributes={attributes} listeners={listeners} />
                <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1 text-xs text-amber-700">
                    Unresolved AI field — keep it as a real field or delete it before saving.
                </div>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-amber-600 hover:text-red-600"
                    title="Delete unresolved block"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 pl-6" onClick={(e) => e.stopPropagation()}>
                <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Label"
                    className="h-7 w-48 text-xs"
                />
                <Input
                    value={fieldKey}
                    onChange={(e) => setFieldKey(e.target.value)}
                    placeholder="field_key"
                    className="h-7 w-44 font-mono text-xs"
                />
                <Button
                    type="button"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={!canResolve}
                    onClick={() => onResolve(normalizedKey, label.trim() || normalizedKey)}
                >
                    <Check className="h-3.5 w-3.5" />
                    Keep as field
                </Button>
                {duplicate && (
                    <span className="text-[10px] text-red-600">Key already used in this form.</span>
                )}
            </div>
        </div>
    );
}
