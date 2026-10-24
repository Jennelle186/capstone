"use client";

import { textStyleToCss } from "@/lib/formLayout";
import type { FormBlock, FormFieldSpec, FormLayoutSection, StructuredFormDocument } from "@/types/formLayout";
import type { FormValue, FormValues } from "@/types/form";

interface FormFillBodyProps {
    doc: StructuredFormDocument;
    values: FormValues;
    onChange: (key: string, value: FormValue) => void;
    readOnly?: boolean;
}

/** Editable online fill renderer for a structured form (Phase 4B). */
export default function FormFillBody({ doc, values, onChange, readOnly = false }: FormFillBodyProps) {
    return (
        <div className="space-y-6">
            {doc.sections.map((section) => (
                <FillSection key={section.id} section={section} values={values} onChange={onChange} readOnly={readOnly} />
            ))}
        </div>
    );
}

function FillSection({
    section,
    values,
    onChange,
    readOnly,
}: {
    section: FormLayoutSection;
    values: FormValues;
    onChange: (key: string, value: FormValue) => void;
    readOnly: boolean;
}) {
    const blocks = section.blocks;
    const useBlocks = !!blocks && blocks.length > 0;

    return (
        <section>
            <h2 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-wide text-slate-800">
                {section.heading}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {useBlocks
                    ? (blocks as FormBlock[]).map((block) => (
                          <FillBlock
                              key={block.id}
                              block={block}
                              values={values}
                              onChange={onChange}
                              readOnly={readOnly}
                          />
                      ))
                    : section.fields.map((field) => (
                          <FillField
                              key={field.id}
                              field={field}
                              value={values[field.field_key]}
                              onChange={(value) => onChange(field.field_key, value)}
                              readOnly={readOnly}
                          />
                      ))}
            </div>
        </section>
    );
}

function FillBlock({
    block,
    values,
    onChange,
    readOnly,
}: {
    block: FormBlock;
    values: FormValues;
    onChange: (key: string, value: FormValue) => void;
    readOnly: boolean;
}) {
    switch (block.type) {
        case "field":
            return (
                <FillField
                    field={block}
                    value={values[block.field_key]}
                    onChange={(value) => onChange(block.field_key, value)}
                    readOnly={readOnly}
                />
            );
        case "paragraph":
            return (
                <p className="col-span-full text-sm leading-relaxed text-slate-600" style={textStyleToCss(block.style)}>
                    {block.text}
                </p>
            );
        case "table": {
            const header = block.headerRow && block.rows.length > 0 ? block.rows[0] : null;
            const body = header ? block.rows.slice(1) : block.rows;
            return (
                <div className="col-span-full overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
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
                </div>
            );
        }
        case "signature":
            return (
                <div className="col-span-full pt-2">
                    <div className="h-9 border-b border-slate-400" />
                    <div className="mt-1 text-[10px] uppercase tracking-[0.08em] text-slate-500">{block.label}</div>
                </div>
            );
        default:
            return null;
    }
}

function FillField({
    field,
    value,
    onChange,
    readOnly,
}: {
    field: FormFieldSpec;
    value: FormValue | undefined;
    onChange: (value: FormValue) => void;
    readOnly: boolean;
}) {
    const id = `fill-${field.field_key}`;
    const singleControl = field.ui_component === "text_input" || field.ui_component === "date_picker" || field.ui_component === "dropdown";
    const label = (
        <>
            {field.label}
            {field.required && <span className="ml-0.5 text-red-500">*</span>}
        </>
    );

    return (
        <div className="min-w-0">
            {singleControl ? (
                <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {label}
                </label>
            ) : (
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">{label}</span>
            )}
            <div className="mt-1">{renderInput(field, value, onChange, readOnly, id)}</div>
        </div>
    );
}

function renderInput(
    field: FormFieldSpec,
    value: FormValue | undefined,
    onChange: (v: FormValue) => void,
    readOnly: boolean,
    id: string,
) {
    const disabled = readOnly;

    switch (field.ui_component) {
        case "date_picker":
            return (
                <input
                    id={id}
                    type="date"
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm disabled:bg-slate-50"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                />
            );
        case "dropdown": {
            const options = field.options ?? [];
            return (
                <select
                    id={id}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-sm disabled:bg-slate-50"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                >
                    <option value="">Select…</option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            );
        }
        case "radio_group": {
            const options = field.options ?? [];
            const selected = typeof value === "string" ? value : "";
            return (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1.5">
                    {options.map((option) => (
                        <label key={option.value} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                            <input
                                type="radio"
                                name={field.field_key}
                                value={option.value}
                                checked={selected === option.value}
                                onChange={() => onChange(option.value)}
                                disabled={disabled}
                                className="h-4 w-4"
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
            );
        }
        case "checkbox_group": {
            const options = field.options ?? [];
            const selected = Array.isArray(value) ? value : [];
            const toggle = (optionValue: string) => {
                if (selected.includes(optionValue)) onChange(selected.filter((v) => v !== optionValue));
                else onChange([...selected, optionValue]);
            };
            return (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 pt-1.5">
                    {options.map((option) => (
                        <label key={option.value} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                            <input
                                type="checkbox"
                                value={option.value}
                                checked={selected.includes(option.value)}
                                onChange={() => toggle(option.value)}
                                disabled={disabled}
                                className="h-4 w-4"
                            />
                            {option.label}
                        </label>
                    ))}
                </div>
            );
        }
        default:
            return (
                <input
                    id={id}
                    className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm disabled:bg-slate-50"
                    value={typeof value === "string" ? value : ""}
                    onChange={(e) => onChange(e.target.value)}
                    disabled={disabled}
                    placeholder="Type here"
                />
            );
    }
}
