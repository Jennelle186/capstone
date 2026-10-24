import { ChevronDown } from "lucide-react";

import { textStyleToCss } from "@/lib/formLayout";
import type { FormFieldSpec, TextStyle } from "@/types/formLayout";

/** Renders a single field exactly as it should appear on the printed form. */
export default function FormFieldPreview({
    field,
    style,
    value,
}: {
    field: FormFieldSpec;
    style?: TextStyle | null;
    /** Filled-in value (Phase 4B export). When provided, renders the answer instead of a blank control. */
    value?: string | string[] | null;
}) {
    return (
        <div className="min-w-0">
            <div
                className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-600"
                style={textStyleToCss(style)}
            >
                {field.label}
                {field.required && <span className="ml-0.5 text-primary">*</span>}
            </div>
            <div className="mt-1.5">{value !== undefined && value !== null ? renderValue(field, value) : renderControl(field)}</div>
        </div>
    );
}

function renderValue(field: FormFieldSpec, value: string | string[]) {
    const values = (Array.isArray(value) ? value : [value]).filter(Boolean);
    if (values.length === 0) return renderControl(field);

    const labels = values.map((v) => {
        const option = (field.options ?? []).find((o) => o.value === v);
        return option?.label ?? v;
    });

    return (
        <div className="flex min-h-6 items-end border-b border-slate-400 pb-0.5 text-xs text-slate-900">
            {labels.join(", ")}
        </div>
    );
}

function renderControl(field: FormFieldSpec) {
    switch (field.ui_component) {
        case "date_picker":
            return (
                <div className="flex h-6 items-end border-b border-slate-400 pb-0.5 text-[10px] tracking-wide text-slate-300">
                    MM / DD / YYYY
                </div>
            );
        case "dropdown":
            return (
                <div className="flex h-6 items-center justify-between border-b border-slate-400">
                    <span className="text-[10px] text-slate-300">Select</span>
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </div>
            );
        case "radio_group":
        case "checkbox_group": {
            const options = field.options ?? [];
            return (
                <div className="flex min-h-6 flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5">
                    {options.length === 0 ? (
                        <span className="text-[10px] text-slate-300">No options</span>
                    ) : (
                        options.map((option) => (
                            <span key={option.value} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                                <span
                                    className={
                                        field.ui_component === "radio_group"
                                            ? "h-3 w-3 rounded-full border border-slate-400"
                                            : "h-3 w-3 rounded-[2px] border border-slate-400"
                                    }
                                />
                                {option.label}
                            </span>
                        ))
                    )}
                </div>
            );
        }
        default:
            return <div className="h-6 border-b border-slate-400" />;
    }
}
