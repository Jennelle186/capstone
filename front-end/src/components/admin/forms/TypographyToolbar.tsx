"use client";

import { Bold, Italic, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import type { TextStyle } from "@/types/form";

const ALIGNMENTS = [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" },
    { value: "justify", label: "Justify" },
];

interface TypographyToolbarProps {
    style: Partial<TextStyle>;
    count: number;
    onApply: (patch: Partial<TextStyle>) => void;
    onClear: () => void;
}

export default function TypographyToolbar({ style, count, onApply, onClear }: TypographyToolbarProps) {
    const boldActive = style.bold === true;
    const italicActive = style.italic === true;

    return (
        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <span className="text-xs font-medium text-slate-500">{count} selected</span>
            <button
                type="button"
                onClick={onClear}
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                title="Clear selection"
            >
                <X className="h-3.5 w-3.5" />
            </button>

            <span className="mx-1 h-4 w-px bg-slate-200" />

            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    min={6}
                    max={72}
                    value={style.fontSize ?? ""}
                    onChange={(e) => onApply({ fontSize: e.target.value === "" ? null : Number(e.target.value) })}
                    className="h-8 w-16 text-xs"
                    title="Font size (px)"
                />
                <span className="text-[10px] text-slate-400">px</span>
            </div>

            <button
                type="button"
                onClick={() => onApply({ bold: !boldActive })}
                className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                    boldActive ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
                title="Bold"
            >
                <Bold className="h-4 w-4" />
            </button>
            <button
                type="button"
                onClick={() => onApply({ italic: !italicActive })}
                className={`flex h-8 w-8 items-center justify-center rounded-md border ${
                    italicActive ? "border-primary bg-primary/10 text-primary" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                }`}
                title="Italic"
            >
                <Italic className="h-4 w-4" />
            </button>

            <Select value={style.align ?? "__none__"} onValueChange={(v) => onApply({ align: v === "__none__" ? null : (v as TextStyle["align"]) })}>
                <SelectTrigger className="h-8 w-28">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="__none__">Align: auto</SelectItem>
                    {ALIGNMENTS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                            {a.label}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    min={0}
                    max={48}
                    value={style.spacing ?? ""}
                    onChange={(e) => onApply({ spacing: e.target.value === "" ? null : Number(e.target.value) })}
                    className="h-8 w-16 text-xs"
                    title="Spacing (px)"
                />
                <span className="text-[10px] text-slate-400">spacing</span>
            </div>
        </div>
    );
}
