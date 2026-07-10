import { BarChart3, GripVertical, Lock, Plus, Trash2, Unlock, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FIELD_TYPES, normalizeFieldKey } from "@/lib/schema-utils";
import type { BucketConfig, ExtractionSchemaField, ExtractionSchemaFieldType } from "@/types/extractionSchema";

interface FieldEditorRowProps {
    field: ExtractionSchemaField;
    index: number;
    onUpdate: (fieldId: string, next: Partial<ExtractionSchemaField>) => void;
    onDelete: (fieldId: string) => void;
    isLast: boolean;
}

function FieldOptionEditor({
    options,
    onOptionsChange,
    readOnly,
}: {
    options: ExtractionSchemaField["options"];
    onOptionsChange: (options: ExtractionSchemaField["options"]) => void;
    readOnly?: boolean;
}) {
    const [newLabel, setNewLabel] = useState("");
    const [newValue, setNewValue] = useState("");
    const [showAdvanced, setShowAdvanced] = useState(false);

    const currentOptions = options ?? [];

    const addOption = () => {
        if (!newLabel.trim()) return;
        const value = showAdvanced && newValue.trim()
            ? newValue.trim()
            : normalizeFieldKey(newLabel);
        onOptionsChange([...currentOptions, { value, label: newLabel.trim() }]);
        setNewLabel("");
        setNewValue("");
    };

    const removeOption = (index: number) => {
        onOptionsChange(currentOptions.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-1.5 mt-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Options</p>
            {currentOptions.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {currentOptions.map((opt, i) => (
                        <Badge key={opt.value} variant="secondary" className="gap-1 pr-1 text-[10px]">
                            {opt.label}
                            <button
                                type="button"
                                onClick={() => removeOption(i)}
                                disabled={readOnly}
                                className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:pointer-events-none"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>
            )}
            {showAdvanced ? (
                <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            placeholder="Display Label (e.g., First Year Student)"
                            value={newLabel}
                            onChange={(e) => setNewLabel(e.target.value)}
                            disabled={readOnly}
                            className="h-7 text-xs"
                        />
                        <Input
                            placeholder="Stored Value (e.g., freshman_year_1)"
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            disabled={readOnly}
                            className="h-7 text-xs"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full text-xs gap-1"
                        onClick={addOption}
                        disabled={readOnly}
                    >
                        <Plus className="h-3.5 w-3.5" /> Add
                    </Button>
                </div>
            ) : (
                <div className="flex items-center gap-1.5">
                    <Input
                        placeholder="Type option and press Enter (e.g., Regular, Probational)"
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        disabled={readOnly}
                        className="h-8 text-xs flex-1"
                        onKeyDown={(e) => { if (e.key === "Enter") addOption(); }}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={addOption}
                        disabled={readOnly}
                    >
                        <Plus className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}
            <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
                {showAdvanced ? "Hide advanced" : "Show advanced (separate label/value)"}
            </button>
        </div>
    );
}

function BucketEditor({
    buckets,
    onBucketsChange,
    readOnly,
}: {
    buckets: BucketConfig[] | null | undefined;
    onBucketsChange: (buckets: BucketConfig[]) => void;
    readOnly?: boolean;
}) {
    const current = buckets ?? [];

    const [showAutoGen, setShowAutoGen] = useState(false);
    const [genMin, setGenMin] = useState("");
    const [genMax, setGenMax] = useState("");
    const [genStep, setGenStep] = useState("");

    const [minStr, setMinStr] = useState("");
    const [maxStr, setMaxStr] = useState("");
    const [label, setLabel] = useState("");

    const generateBuckets = () => {
        const start = parseFloat(genMin);
        const end = parseFloat(genMax);
        const step = parseFloat(genStep);
        if (isNaN(start) || isNaN(end) || isNaN(step) || step <= 0) return;

        const generated: BucketConfig[] = [];
        let lo = start;
        while (lo < end) {
            const hi = Math.min(lo + step, end);
            generated.push({ min: lo, max: hi, label: `${lo}-${hi}` });
            lo = hi;
        }
        onBucketsChange(generated);
        setShowAutoGen(false);
        setGenMin("");
        setGenMax("");
        setGenStep("");
    };

    const updateBucket = (index: number, next: Partial<BucketConfig>) => {
        const updated = current.map((b, i) => (i === index ? { ...b, ...next } : b));
        onBucketsChange(updated);
    };

    const addBucket = () => {
        const min = minStr.trim() === "" ? undefined : parseFloat(minStr);
        const max = maxStr.trim() === "" ? undefined : parseFloat(maxStr);
        const lbl = label.trim();
        if (!lbl && min === undefined && max === undefined) return;
        const computedLabel = lbl || `${min ?? ""}-${max ?? ""}`;
        onBucketsChange([...current, { min, max, label: computedLabel }]);
        setMinStr("");
        setMaxStr("");
        setLabel("");
    };

    const removeBucket = (index: number) => {
        onBucketsChange(current.filter((_, i) => i !== index));
    };

    return (
        <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Buckets</p>
                <button
                    type="button"
                    onClick={() => setShowAutoGen(!showAutoGen)}
                    className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                    {showAutoGen ? "Hide auto-generate" : "Auto-generate"}
                </button>
            </div>

            {showAutoGen && (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2 space-y-1.5">
                    <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-wide">Generate evenly-spaced buckets</p>
                    <div className="grid grid-cols-3 gap-1.5">
                        <Input
                            placeholder="Start min"
                            value={genMin}
                            onChange={(e) => setGenMin(e.target.value)}
                            disabled={readOnly}
                            className="h-7 text-xs"
                            type="number"
                        />
                        <Input
                            placeholder="End max"
                            value={genMax}
                            onChange={(e) => setGenMax(e.target.value)}
                            disabled={readOnly}
                            className="h-7 text-xs"
                            type="number"
                        />
                        <Input
                            placeholder="Step size"
                            value={genStep}
                            onChange={(e) => setGenStep(e.target.value)}
                            disabled={readOnly}
                            className="h-7 text-xs"
                            type="number"
                        />
                    </div>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="w-full text-xs gap-1"
                        onClick={generateBuckets}
                        disabled={readOnly}
                    >
                        <Plus className="h-3.5 w-3.5" /> Generate
                    </Button>
                </div>
            )}

            {current.length > 0 && (
                <div className="space-y-1.5">
                    {current.map((b, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_1.5fr_auto] gap-1 items-center">
                            <Input
                                value={b.min ?? ""}
                                placeholder="Min"
                                onChange={(e) => {
                                    const val = e.target.value.trim() === "" ? undefined : parseFloat(e.target.value);
                                    updateBucket(i, { min: val });
                                }}
                                disabled={readOnly}
                                className="h-7 text-xs"
                                type="number"
                            />
                            <Input
                                value={b.max ?? ""}
                                placeholder="Max"
                                onChange={(e) => {
                                    const val = e.target.value.trim() === "" ? undefined : parseFloat(e.target.value);
                                    updateBucket(i, { max: val });
                                }}
                                disabled={readOnly}
                                className="h-7 text-xs"
                                type="number"
                            />
                            <Input
                                value={b.label}
                                placeholder="Label"
                                onChange={(e) => updateBucket(i, { label: e.target.value })}
                                disabled={readOnly}
                                className="h-7 text-xs"
                            />
                            <button
                                type="button"
                                onClick={() => removeBucket(i)}
                                disabled={readOnly}
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-red-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-3 gap-1.5">
                <Input
                    placeholder="Min"
                    value={minStr}
                    onChange={(e) => setMinStr(e.target.value)}
                    disabled={readOnly}
                    className="h-7 text-xs"
                    type="number"
                />
                <Input
                    placeholder="Max"
                    value={maxStr}
                    onChange={(e) => setMaxStr(e.target.value)}
                    disabled={readOnly}
                    className="h-7 text-xs"
                    type="number"
                />
                <Input
                    placeholder="Label (e.g. 75-80)"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    disabled={readOnly}
                    className="h-7 text-xs"
                />
            </div>
            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full text-xs gap-1"
                onClick={addBucket}
                disabled={readOnly}
            >
                <Plus className="h-3.5 w-3.5" /> Add Bucket
            </Button>
        </div>
    );
}

export default function FieldEditorRow({
    field,
    index,
    onUpdate,
    onDelete,
    isLast,
}: FieldEditorRowProps) {
    const [showAnalytics, setShowAnalytics] = useState(!!field.is_analytics);
    const analyticsModeOptions = [
        { value: "__auto__", label: "Auto (inferred from type)" },
        { value: "distribution", label: "Distribution" },
        { value: "numeric_summary", label: "Numeric Summary" },
        { value: "boolean_summary", label: "Boolean Summary" },
        { value: "bucketized", label: "Bucketized (numeric ranges)" },
    ];

    const toggleAnalytics = () => {
        const next = !field.is_analytics;
        setShowAnalytics(next);
        onUpdate(field.id, {
            is_analytics: next,
            canonical_key: next ? (field.canonical_key ?? normalizeFieldKey(field.key)) : null,
        });
    };

    return (
        <div className={`rounded-lg border p-3 border-border transition-colors hover:border-slate-300 ${field.readOnly ? 'bg-slate-50/50 dark:bg-slate-900/30' : 'bg-card'}`}>
        <div className="grid grid-cols-12 gap-x-3 gap-y-2 items-center">
            <div className="col-span-1 flex items-center gap-1.5">
                <button type="button" className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground" aria-label="Drag to reorder">
                    <GripVertical className="h-4 w-4" />
                </button>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                    {index + 1}
                </span>
            </div>

            <div className="col-span-3 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Label Name</p>
                <Input
                    value={field.key}
                    placeholder="e.g. Full Name"
                    onChange={(event) =>
                        onUpdate(field.id, { key: event.target.value })
                    }
                    disabled={field.readOnly}
                    className="h-8 text-sm bg-background"
                />
            </div>

            <div className="col-span-2 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Variable Key</p>
                <Input
                    value={normalizeFieldKey(field.key)}
                    readOnly
                    disabled={field.readOnly}
                    className="h-8 text-sm font-mono bg-muted/50 text-muted-foreground"
                />
            </div>

            <div className="col-span-2 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Type</p>
                <Select
                    value={field.type}
                    onValueChange={(value) =>
                        onUpdate(field.id, {
                            type: value as ExtractionSchemaFieldType,
                        })
                    }
                    disabled={field.readOnly}
                >
                    <SelectTrigger className="h-8 text-sm bg-background">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {FIELD_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                                {type}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                {(field.type === "select" || field.type === "multi-select" || (field.options ?? []).length > 0) && (
                    <FieldOptionEditor
                        options={field.options}
                        onOptionsChange={(newOptions) =>
                            onUpdate(field.id, { options: newOptions })
                        }
                        readOnly={field.readOnly}
                    />
                )}
            </div>

            <div className="col-span-3 space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">AI Guideline Instructions</p>
                <Textarea
                    value={field.description}
                    placeholder="Explain what this field means and where it appears in the document."
                    onChange={(event) =>
                        onUpdate(field.id, { description: event.target.value })
                    }
                    disabled={field.readOnly}
                    className="h-8 min-h-8 max-h-24 resize-y py-1 px-2 text-xs leading-tight bg-background"
                />
            </div>

            <div className="col-span-1 flex flex-row items-center justify-end gap-1.5 pt-4">
                <button
                    type="button"
                    disabled={field.readOnly}
                    onClick={() =>
                        onUpdate(field.id, { required: !field.required })
                    }
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold transition-colors ${
                        field.readOnly
                            ? "opacity-50 cursor-not-allowed"
                            : field.required
                              ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800"
                    }`}
                    title={field.required ? "Required field" : "Optional field"}
                >
                    REQ
                </button>

                <button
                    type="button"
                    disabled={field.readOnly}
                    onClick={toggleAnalytics}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                        field.readOnly
                            ? "opacity-50 cursor-not-allowed"
                            : field.is_analytics
                              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800"
                    }`}
                    title={field.is_analytics ? "Analytics enabled" : "Enable analytics"}
                >
                    <BarChart3 className="h-3.5 w-3.5" />
                </button>

                <button
                    type="button"
                    onClick={() =>
                        onUpdate(field.id, { readOnly: !field.readOnly })
                    }
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                        field.readOnly
                            ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                            : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800"
                    }`}
                    title={field.readOnly ? "Adviser-only visibility" : "Visible to all roles"}
                >
                    {field.readOnly ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                </button>

                <Button
                    type="button"
                    variant="ghost"
                    className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:bg-muted hover:text-destructive"
                    disabled={isLast || field.readOnly}
                    onClick={() => onDelete(field.id)}
                    aria-label="Remove field"
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>

        {showAnalytics && field.is_analytics && (
            <div className="mt-3 grid grid-cols-12 gap-x-3 gap-y-3 rounded-md bg-slate-50 p-3">
                <div className="col-span-4 space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Canonical Key</p>
                    <Input
                        value={field.canonical_key ?? ""}
                        placeholder="e.g. gender, gpa"
                        onChange={(e) =>
                            onUpdate(field.id, { canonical_key: e.target.value || null })
                        }
                        disabled={field.readOnly}
                        className="h-8 text-sm font-mono bg-white"
                    />
                </div>
                <div className="col-span-3 space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Analytics Group</p>
                    <Input
                        value={field.analytics_group ?? ""}
                        placeholder="e.g. Demographics"
                        onChange={(e) =>
                            onUpdate(field.id, { analytics_group: e.target.value || null })
                        }
                        disabled={field.readOnly}
                        className="h-8 text-sm bg-white"
                    />
                </div>
                <div className="col-span-3 space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Display Label</p>
                    <Input
                        value={field.analytics_label ?? ""}
                        placeholder="Optional display label"
                        onChange={(e) =>
                            onUpdate(field.id, { analytics_label: e.target.value || null })
                        }
                        disabled={field.readOnly}
                        className="h-8 text-sm bg-white"
                    />
                </div>
                <div className="col-span-2 space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Mode Override</p>
                    <Select
                        value={field.analytics_mode ?? "__auto__"}
                        onValueChange={(value) =>
                            onUpdate(field.id, {
                                analytics_mode: (value === "__auto__" ? null : value) as ExtractionSchemaField["analytics_mode"],
                            })
                        }
                        disabled={field.readOnly}
                    >
                        <SelectTrigger className="h-8 text-sm bg-white">
                            <SelectValue placeholder="Auto" />
                        </SelectTrigger>
                        <SelectContent>
                            {analyticsModeOptions.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {field.analytics_mode === "bucketized" && (
                    <div className="col-span-12 space-y-1">
                        <BucketEditor
                            buckets={field.buckets}
                            onBucketsChange={(buckets) =>
                                onUpdate(field.id, { buckets })
                            }
                            readOnly={field.readOnly}
                        />
                    </div>
                )}
            </div>
        )}
        </div>
    );
}
