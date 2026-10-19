"use client";

import { ChevronDown, ChevronUp, FileCog } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { normalizePageSettings } from "@/lib/formLayout";
import type { PageMargins, PageSettings } from "@/types/form";

interface PageSettingsPanelProps {
    page: PageSettings | null | undefined;
    onChange: (patch: Partial<Omit<PageSettings, "margins">> & { margins?: Partial<PageMargins> }) => void;
}

const MARGIN_FIELDS: Array<{ key: keyof PageMargins; label: string }> = [
    { key: "top", label: "Top" },
    { key: "right", label: "Right" },
    { key: "bottom", label: "Bottom" },
    { key: "left", label: "Left" },
];

export default function PageSettingsPanel({ page, onChange }: PageSettingsPanelProps) {
    const [open, setOpen] = useState(false);
    const settings = normalizePageSettings(page);
    const margins = settings.margins!;

    return (
        <div className="rounded-lg border border-slate-200 bg-white">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
            >
                <FileCog className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="text-xs font-medium text-slate-700">Page setup</span>
                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                    {settings.size} · {settings.orientation}
                </span>
                <span className="flex-1" />
                {open ? (
                    <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
                ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                )}
            </button>

            {open && (
                <div className="space-y-3 border-t border-slate-100 px-3 py-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                            <span className="text-[11px] font-medium text-slate-500">Paper size</span>
                            <Select
                                value={settings.size}
                                onValueChange={(value) => onChange({ size: value as PageSettings["size"] })}
                            >
                                <SelectTrigger className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="A4">A4 (210 × 297 mm)</SelectItem>
                                    <SelectItem value="Letter">Letter (216 × 279 mm)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1">
                            <span className="text-[11px] font-medium text-slate-500">Orientation</span>
                            <Select
                                value={settings.orientation}
                                onValueChange={(value) =>
                                    onChange({ orientation: value as PageSettings["orientation"] })
                                }
                            >
                                <SelectTrigger className="h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="portrait">Portrait</SelectItem>
                                    <SelectItem value="landscape">Landscape</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <span className="text-[11px] font-medium text-slate-500">Margins (mm)</span>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {MARGIN_FIELDS.map((field) => (
                                <label key={field.key} className="space-y-1">
                                    <span className="block text-[10px] text-slate-400">{field.label}</span>
                                    <Input
                                        type="number"
                                        min={0}
                                        max={50}
                                        step={1}
                                        value={margins[field.key]}
                                        onChange={(e) =>
                                            onChange({
                                                margins: {
                                                    [field.key]: Number(e.target.value) || 0,
                                                } as Partial<PageMargins>,
                                            })
                                        }
                                        className="h-8 text-xs"
                                    />
                                </label>
                            ))}
                        </div>
                    </div>

                    <p className="text-[10px] leading-relaxed text-slate-400">
                        Page size and margins apply to both the editor canvas and the printed output.
                    </p>
                </div>
            )}
        </div>
    );
}
