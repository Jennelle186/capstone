"use client";

import { Plus } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addSection, moveSection, removeSection, replaceSection } from "@/lib/formLayout";
import FormFieldPreview from "./FormFieldPreview";
import SectionCard from "./SectionCard";
import type { FormLayoutSection, FormPaperMode, StructuredFormDocument } from "@/types/formLayout";

const PRINT_CSS = `
@media print {
    body * { visibility: hidden !important; }
    .form-paper, .form-paper * { visibility: visible !important; }
    .form-paper {
        position: absolute;
        left: 0;
        top: 0;
        margin: 0 !important;
        box-shadow: none !important;
    }
    @page { size: A4; margin: 0; }
}
`;

interface FormPaperProps {
    doc: StructuredFormDocument;
    mode: FormPaperMode;
    onChange: (next: StructuredFormDocument) => void;
}

export default function FormPaper({ doc, mode, onChange }: FormPaperProps) {
    const editing = mode === "edit";

    return (
        <div className="form-paper mx-auto w-[210mm] min-h-[297mm] bg-white px-[16mm] py-[14mm] text-slate-900 shadow-[0_1px_3px_rgba(15,23,42,0.10),0_18px_50px_-20px_rgba(15,23,42,0.35)]">
            <style>{PRINT_CSS}</style>

            <header className="flex items-center gap-4 border-b-[3px] border-primary pb-3">
                <img src="/ccs-logo.jpg" alt="Institution logo" className="h-16 w-16 shrink-0 object-contain" />
                <div className="flex-1 text-center">
                    <div className="font-serif text-lg font-bold uppercase leading-tight tracking-[0.02em] text-slate-900">
                        College of Computer Studies
                    </div>
                    <div className="text-[11px] text-slate-500">Campus Address, City, Province</div>
                    <div className="text-[11px] text-slate-500">registrar@example.edu · (000) 000-0000</div>
                </div>
                <div className="w-[70px] shrink-0 text-right">
                    <div className="inline-block rounded border border-slate-300 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Form No.
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">ADS-01</div>
                </div>
            </header>

            <div className="mt-7 text-center">
                {editing ? (
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
                ) : (
                    <>
                        <h1 className="font-serif text-[26px] font-bold uppercase tracking-[0.05em] text-slate-900">
                            {doc.title}
                        </h1>
                        {doc.subtitle && <p className="mt-1 text-xs font-medium tracking-wide text-slate-500">{doc.subtitle}</p>}
                    </>
                )}
            </div>

            <div className="mt-5">
                {editing ? (
                    <Textarea
                        value={doc.instructions ?? ""}
                        onChange={(e) => onChange({ ...doc, instructions: e.target.value })}
                        className="min-h-[56px] text-[12px]"
                        placeholder="Instructions (optional)"
                    />
                ) : (
                    doc.instructions && (
                        <p className="text-[11px] italic leading-relaxed text-slate-600">{doc.instructions}</p>
                    )
                )}
            </div>

            <div className="mt-6 space-y-7">
                {doc.sections.map((section, index) =>
                    editing ? (
                        <SectionCard
                            key={section.id}
                            section={section}
                            index={index}
                            canMoveUp={index > 0}
                            canMoveDown={index < doc.sections.length - 1}
                            onChange={(next) => onChange(replaceSection(doc, next))}
                            onRemove={() => onChange(removeSection(doc, section.id))}
                            onMove={(direction) => onChange(moveSection(doc, section.id, direction))}
                        />
                    ) : (
                        <StaticSection key={section.id} section={section} index={index} />
                    ),
                )}

                {editing && (
                    <button
                        type="button"
                        onClick={() => onChange(addSection(doc))}
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 py-2.5 text-xs text-slate-400 transition-colors hover:border-primary/50 hover:text-primary"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Add section
                    </button>
                )}
            </div>

            <div className="mt-14 grid grid-cols-2 gap-12">
                <div>
                    <div className="h-9 border-b border-slate-400" />
                    {editing ? (
                        <Input
                            value={doc.signatureLabel}
                            onChange={(e) => onChange({ ...doc, signatureLabel: e.target.value })}
                            className="mt-1 h-6 border-0 px-0 text-[10px] uppercase tracking-[0.08em] text-slate-500 shadow-none focus-visible:ring-0"
                        />
                    ) : (
                        <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500">{doc.signatureLabel}</div>
                    )}
                </div>
                <div>
                    <div className="h-9 border-b border-slate-400" />
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500">Date</div>
                </div>
            </div>

            <div className="mt-10 border-t border-slate-200 pt-2">
                {editing ? (
                    <Input
                        value={doc.footer ?? ""}
                        onChange={(e) => onChange({ ...doc, footer: e.target.value })}
                        placeholder="Footer (optional)"
                        className="h-6 border-0 px-0 text-center text-[10px] uppercase tracking-[0.14em] text-slate-400 shadow-none focus-visible:ring-0"
                    />
                ) : (
                    doc.footer && (
                        <div className="text-center text-[9px] uppercase tracking-[0.16em] text-slate-400">{doc.footer}</div>
                    )
                )}
            </div>
        </div>
    );
}

function StaticSection({ section, index }: { section: FormLayoutSection; index: number }) {
    return (
        <section>
            <div className="mb-3 flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-800">{section.heading}</h2>
                <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {section.fields.map((field) => (
                    <FormFieldPreview key={field.id} field={field} />
                ))}
            </div>
            {section.fields.length === 0 && <p className="text-[11px] italic text-slate-300">No fields in this section.</p>}
        </section>
    );
}
