"use client";

import {
    DndContext,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    addSection,
    applyStyleToBlocks,
    getPaperDimensions,
    getSelectedStyle,
    moveSection,
    normalizePageSettings,
    removeSection,
    replaceSection,
} from "@/lib/formLayout";
import FormStaticBody from "./FormStaticBody";
import SectionCard from "./SectionCard";
import TypographyToolbar from "./TypographyToolbar";
import { usePublicBranding } from "@/hooks/usePublicBranding";
import type {
    FormLayoutSection,
    FormPaperMode,
    Letterhead,
    StructuredFormDocument,
    TextStyle,
} from "@/types/formLayout";

interface FormPaperProps {
    doc: StructuredFormDocument;
    mode: FormPaperMode;
    onChange: (next: StructuredFormDocument) => void;
}

export default function FormPaper({ doc, mode, onChange }: FormPaperProps) {
    const editing = mode === "edit";
    const { branding } = usePublicBranding();

    const letterhead = doc.letterhead;
    const institutionName = letterhead?.institutionName ?? branding.institution_name ?? "College of Computer Studies";
    const addressLines =
        letterhead?.addressLines && letterhead.addressLines.length > 0
            ? letterhead.addressLines
            : branding.address_lines.length > 0
              ? branding.address_lines
              : ["Campus Address, City, Province"];
    const contactLine = letterhead?.contactLine ?? branding.contact_line ?? "registrar@example.edu · (000) 000-0000";
    const formNumber = letterhead?.formNumber ?? "ADS-01";
    const logoSrc = branding.logo_url ?? "/ccs-logo.jpg";

    const setLetterhead = (patch: Partial<Letterhead>) =>
        onChange({ ...doc, letterhead: { ...(letterhead ?? {}), ...patch } });

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const handleSelectField = (id: string, additive: boolean) => {
        setSelectedIds((prev) => {
            if (additive) {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
            }
            return new Set([id]);
        });
    };

    const clearSelection = () => setSelectedIds(new Set());

    useEffect(() => {
        if (!editing) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setSelectedIds(new Set());
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [editing]);

    const selectedStyle = useMemo(() => getSelectedStyle(doc, selectedIds), [doc, selectedIds]);

    const applyStyle = (patch: Partial<TextStyle>) => {
        onChange(applyStyleToBlocks(doc, selectedIds, patch));
    };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Section reorder?
        const activeSectionIndex = doc.sections.findIndex((s) => s.id === active.id);
        if (activeSectionIndex >= 0) {
            const overSectionIndex = doc.sections.findIndex((s) => s.id === over.id);
            if (overSectionIndex < 0) return;
            const sections = arrayMove(doc.sections, activeSectionIndex, overSectionIndex);
            onChange({ ...doc, sections });
            return;
        }

        // Block reorder within its section.
        const sectionIndex = doc.sections.findIndex((s) => (s.blocks ?? []).some((b) => b.id === active.id));
        if (sectionIndex < 0) return;
        const section = doc.sections[sectionIndex];
        const blocks = section.blocks ?? [];
        const from = blocks.findIndex((b) => b.id === active.id);
        const to = blocks.findIndex((b) => b.id === over.id);
        if (from < 0 || to < 0) return;
        const reordered = arrayMove(blocks, from, to);
        onChange(replaceSection(doc, { ...section, blocks: reordered }));
    };

    const page = normalizePageSettings(doc.page);
    const margins = page.margins!;
    const { width: paperWidth, height: paperHeight } = getPaperDimensions(page);

    const usedFieldKeys = useMemo(
        () =>
            doc.sections
                .flatMap((section) => section.blocks ?? [])
                .filter((block) => block.type === "field")
                .map((block) => block.field_key.trim().toLowerCase().replace(/\s+/g, "_")),
        [doc.sections],
    );

    return (
        <>
            {editing && selectedIds.size > 0 && (
                <TypographyToolbar
                    style={selectedStyle}
                    count={selectedIds.size}
                    onApply={applyStyle}
                    onClear={clearSelection}
                />
            )}
            <div
                className="form-paper mx-auto bg-white text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.10),0_18px_50px_-20px_rgba(15,23,42,0.35)]"
                style={{
                    width: `${paperWidth}mm`,
                    minHeight: `${paperHeight}mm`,
                    padding: `${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm`,
                }}
            >
            {editing ? (
                <>
            <header className="flex items-center gap-4 border-b-[3px] border-primary pb-3">
                <img src={logoSrc} alt="Institution logo" className="h-16 w-16 shrink-0 object-contain" />
                <div className="flex-1 space-y-1">
                    <Input
                        value={institutionName}
                        onChange={(e) => setLetterhead({ institutionName: e.target.value })}
                        className="h-7 text-center font-serif font-bold uppercase tracking-[0.02em]"
                        placeholder="Institution name"
                    />
                    <Textarea
                        value={addressLines.join("\n")}
                        onChange={(e) => setLetterhead({ addressLines: e.target.value.split("\n") })}
                        className="min-h-0 resize-none text-center text-[11px] leading-snug"
                        rows={2}
                        placeholder="Address lines (one per line)"
                    />
                    <Input
                        value={contactLine}
                        onChange={(e) => setLetterhead({ contactLine: e.target.value })}
                        className="h-6 text-center text-[11px]"
                        placeholder="Contact (email · phone)"
                    />
                </div>
                <div className="w-[70px] shrink-0 text-right">
                    <div className="inline-block rounded border border-slate-300 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Form No.
                    </div>
                    <Input
                        value={formNumber}
                        onChange={(e) => setLetterhead({ formNumber: e.target.value })}
                        className="mt-1 h-6 text-right font-mono text-[10px]"
                    />
                </div>
            </header>

            <div className="mt-7 text-center">
                <div className="mx-auto max-w-md space-y-2">
                    <Input
                        value={doc.title}
                        onChange={(e) => onChange({ ...doc, title: e.target.value })}
                        className="text-center font-serif font-semibold"
                        placeholder="Form title"
                    />
                    <Input
                        value={doc.subtitle ?? ""}
                        onChange={(e) => onChange({ ...doc, subtitle: e.target.value })}
                        className="text-center"
                        placeholder="Subtitle (optional)"
                    />
                </div>
            </div>

            <div className="mt-5">
                <Textarea
                    value={doc.instructions ?? ""}
                    onChange={(e) => onChange({ ...doc, instructions: e.target.value })}
                    className="min-h-[56px] text-[12px]"
                    placeholder="Instructions (optional)"
                />
            </div>

            <div className="mt-6 space-y-7">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={doc.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                        {doc.sections.map((section, index) => (
                            <SortableSection
                                key={section.id}
                                section={section}
                                index={index}
                                canMoveUp={index > 0}
                                canMoveDown={index < doc.sections.length - 1}
                                onChange={(next) => onChange(replaceSection(doc, next))}
                                onRemove={() => onChange(removeSection(doc, section.id))}
                                onMove={(direction) => onChange(moveSection(doc, section.id, direction))}
                                selectedIds={selectedIds}
                                onSelectField={handleSelectField}
                                usedFieldKeys={usedFieldKeys}
                            />
                        ))}
                    </SortableContext>
                </DndContext>

                <button
                    type="button"
                    onClick={() => onChange(addSection(doc))}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs text-slate-400 transition-colors hover:border-primary/50 hover:text-primary"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add section
                </button>
            </div>

            <div className="form-keep mt-14 grid grid-cols-2 gap-12">
                <div>
                    <div className="h-9 border-b border-slate-400" />
                    <Input
                        value={doc.signatureLabel}
                        onChange={(e) => onChange({ ...doc, signatureLabel: e.target.value })}
                        className="mt-1 h-6 border-0 px-0 text-[10px] uppercase tracking-[0.08em] text-slate-500 shadow-none focus-visible:ring-0"
                    />
                </div>
                <div>
                    <div className="h-9 border-b border-slate-400" />
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500">Date</div>
                </div>
            </div>

            <div className="mt-10 border-t border-slate-200 pt-2">
                <Input
                    value={doc.footer ?? ""}
                    onChange={(e) => onChange({ ...doc, footer: e.target.value })}
                    placeholder="Footer (optional)"
                    className="h-6 border-0 px-0 text-center text-[10px] uppercase tracking-[0.14em] text-slate-400 shadow-none focus-visible:ring-0"
                />
            </div>
                </>
            ) : (
                <FormStaticBody doc={doc} />
            )}
        </div>
        </>
    );
}

interface SortableSectionProps {
    section: FormLayoutSection;
    index: number;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onChange: (next: FormLayoutSection) => void;
    onRemove: () => void;
    onMove: (direction: -1 | 1) => void;
    selectedIds: Set<string>;
    onSelectField: (id: string, additive: boolean) => void;
    usedFieldKeys: string[];
}

function SortableSection({
    section,
    index,
    canMoveUp,
    canMoveDown,
    onChange,
    onRemove,
    onMove,
    selectedIds,
    onSelectField,
    usedFieldKeys,
}: SortableSectionProps) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id });
    const style = { transform: CSS.Transform.toString(transform), transition };

    return (
        <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : undefined}>
            <SectionCard
                section={section}
                index={index}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                onChange={onChange}
                onRemove={onRemove}
                onMove={onMove}
                dragHandle={{ attributes, listeners }}
                selectedIds={selectedIds}
                onSelectField={onSelectField}
                usedFieldKeys={usedFieldKeys}
            />
        </div>
    );
}
