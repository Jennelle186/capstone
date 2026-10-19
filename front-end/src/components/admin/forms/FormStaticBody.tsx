"use client";

import FormFieldPreview from "./FormFieldPreview";
import { usePublicBranding } from "@/hooks/usePublicBranding";
import { textStyleToCss } from "@/lib/formLayout";
import type { FormBlock, FormLayoutSection, StructuredFormDocument } from "@/types/formLayout";

/**
 * Read-only form body shared by preview mode and the print document.
 *
 * Keeping a single renderer is what makes the on-screen preview and the printed
 * output match: both use the same letterhead, block renderers, spacing, and
 * signature/footer chrome.
 */
export default function FormStaticBody({
    doc,
    suppressPageBreaks = false,
}: {
    doc: StructuredFormDocument;
    /** Used by the fit-to-one-page print path: explicit breaks would defeat the fit. */
    suppressPageBreaks?: boolean;
}) {
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

    return (
        <>
            <header className="flex items-center gap-4 border-b-[3px] border-primary pb-3">
                <img src={logoSrc} alt="Institution logo" className="h-16 w-16 shrink-0 object-contain" />
                <div className="flex-1 text-center">
                    <div className="font-serif text-lg font-bold uppercase leading-tight tracking-[0.02em] text-slate-900">
                        {institutionName}
                    </div>
                    {addressLines.map((line, i) => (
                        <div key={i} className="text-[11px] text-slate-500">
                            {line}
                        </div>
                    ))}
                    <div className="text-[11px] text-slate-500">{contactLine}</div>
                </div>
                <div className="w-[70px] shrink-0 text-right">
                    <div className="inline-block rounded border border-slate-300 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Form No.
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-slate-500">{formNumber}</div>
                </div>
            </header>

            <div className="mt-7 text-center">
                <h1 className="font-serif text-[26px] font-bold uppercase tracking-[0.05em] text-slate-900">
                    {doc.title}
                </h1>
                {doc.subtitle && (
                    <p className="mt-1 text-xs font-medium tracking-wide text-slate-500">{doc.subtitle}</p>
                )}
            </div>

            <div className="mt-5">
                {doc.instructions && (
                    <p className="text-[11px] italic leading-relaxed text-slate-600">{doc.instructions}</p>
                )}
            </div>

            <div className="mt-6 space-y-7">
                {doc.sections.map((section, index) => (
                    <StaticSection
                        key={section.id}
                        section={section}
                        index={index}
                        suppressPageBreaks={suppressPageBreaks}
                    />
                ))}
            </div>

            <div className="form-keep mt-14 grid grid-cols-2 gap-12">
                <div>
                    <div className="h-9 border-b border-slate-400" />
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500">{doc.signatureLabel}</div>
                </div>
                <div>
                    <div className="h-9 border-b border-slate-400" />
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500">Date</div>
                </div>
            </div>

            <div className="mt-10 border-t border-slate-200 pt-2">
                {doc.footer && (
                    <div className="text-center text-[9px] uppercase tracking-[0.16em] text-slate-400">{doc.footer}</div>
                )}
            </div>
        </>
    );
}

function StaticSection({
    section,
    index,
    suppressPageBreaks,
}: {
    section: FormLayoutSection;
    index: number;
    suppressPageBreaks: boolean;
}) {
    const blocks = section.blocks;
    const useBlocks = !!blocks && blocks.length > 0;
    const fieldCount = useBlocks
        ? (blocks as FormBlock[]).filter((b) => b.type === "field").length
        : section.fields.length;
    return (
        <section>
            <div className="form-section-header mb-3 flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded bg-primary/10 text-[10px] font-bold text-primary">
                    {String(index + 1).padStart(2, "0")}
                </span>
                <h2 className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-800">{section.heading}</h2>
                <div className="h-px flex-1 bg-slate-200" />
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                {useBlocks
                    ? (blocks as FormBlock[]).map((block) => {
                          const fullWidth = block.type !== "field" || (block.columnSpan ?? 1) >= 2;
                          const pageBreakBefore =
                              !suppressPageBreaks &&
                              block.type !== "unresolved_field" &&
                              block.pageBreakBefore === true;
                          const keepTogether = block.type !== "table";
                          return (
                              <div
                                  key={block.id}
                                  className={`${fullWidth ? "col-span-2 " : ""}${keepTogether ? "form-block" : ""}`}
                                  style={pageBreakBefore ? { breakBefore: "page" } : undefined}
                              >
                                  <StaticBlock block={block} />
                              </div>
                          );
                      })
                    : section.fields.map((field) => (
                          <FormFieldPreview key={field.id} field={field} />
                      ))}
            </div>
            {fieldCount === 0 && <p className="text-[11px] italic text-slate-300">No fields in this section.</p>}
        </section>
    );
}

function StaticBlock({ block }: { block: FormBlock }) {
    switch (block.type) {
        case "field":
            return <FormFieldPreview field={block} style={block.style} />;
        case "unresolved_field":
            return (
                <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                    ⚠ Unresolved field “{block.label || block.field_key}” — map or delete before saving.
                </div>
            );
        case "paragraph":
            return (
                <p className="text-[11px] leading-relaxed text-slate-600" style={textStyleToCss(block.style)}>
                    {block.text}
                </p>
            );
        case "table": {
            const widths = block.columnWidths;
            const rows = block.rows;
            const header = block.headerRow && rows.length > 0 ? rows[0] : null;
            const body = header ? rows.slice(1) : rows;
            return (
                <table className="form-table w-full border-collapse text-[11px]">
                    {widths && widths.length === block.columns && (
                        <colgroup>
                            {widths.map((width, i) => (
                                <col key={i} style={{ width }} />
                            ))}
                        </colgroup>
                    )}
                    {header && (
                        <thead>
                            <tr>
                                {Array.from({ length: block.columns }).map((_, i) => (
                                    <th key={i} className="border border-slate-300 bg-slate-50 px-2 py-1 text-left font-semibold">
                                        {header[i] ?? ""}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {body.map((row, i) => (
                            <tr key={i}>
                                {Array.from({ length: block.columns }).map((_, j) => (
                                    <td key={j} className="border border-slate-300 px-2 py-1">
                                        {row[j] ?? ""}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            );
        }
        case "signature":
            return (
                <div className="form-keep mt-4">
                    <div className="h-9 border-b border-slate-400" />
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500">{block.label}</div>
                </div>
            );
        default:
            return null;
    }
}
