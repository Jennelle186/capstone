import { BarChart3, GripVertical, Lock, Sigma, Trash2, Unlock } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { findSuggestedKey } from "@/lib/analytics-utils";
import { FIELD_TYPES, normalizeFieldKey } from "@/lib/schema-utils";
import type { CanonicalKeyItem } from "@/types/analytics";
import type { ExtractionSchemaField, ExtractionSchemaFieldType } from "@/types/extractionSchema";
import BucketEditor from "./BucketEditor";
import CanonicalKeyInput from "./CanonicalKeyInput";
import FieldOptionEditor from "./FieldOptionEditor";

interface FieldEditorRowProps {
    field: ExtractionSchemaField;
    index: number;
    allFields: ExtractionSchemaField[];
    onUpdate: (fieldId: string, next: Partial<ExtractionSchemaField>) => void;
    onDelete: (fieldId: string) => void;
    isLast: boolean;
    canonicalKeySuggestions?: CanonicalKeyItem[];
    analyticsGroupSuggestions?: string[];
    duplicateWith?: string[];
}

export default function FieldEditorRow({
    field,
    index,
    allFields,
    onUpdate,
    onDelete,
    isLast,
    canonicalKeySuggestions = [],
    analyticsGroupSuggestions = [],
    duplicateWith = [],
}: FieldEditorRowProps) {
    const [showAnalytics, setShowAnalytics] = useState(!!field.is_analytics);
    const [showComputed, setShowComputed] = useState(!!field.is_computed);
    const analyticsGroupDatalistId = useId();
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
        if (!next) {
            onUpdate(field.id, { is_analytics: false, canonical_key: null });
            return;
        }
        const existing = field.canonical_key;
        if (existing) {
            onUpdate(field.id, { is_analytics: true });
            return;
        }
        const match = findSuggestedKey(field, canonicalKeySuggestions);
        if (match) {
            onUpdate(field.id, {
                is_analytics: true,
                canonical_key: match.item.canonical_key,
                analytics_group: match.item.analytics_group ?? field.analytics_group,
            });
        } else {
            onUpdate(field.id, {
                is_analytics: true,
                canonical_key: normalizeFieldKey(field.key),
            });
        }
    };

    const toggleComputed = () => {
        const next = !field.is_computed;
        setShowComputed(next);
        onUpdate(field.id, {
            is_computed: next,
            computation: next
                ? (field.computation ?? { operation: "average", dependencies: [] })
                : null,
        });
    };

    const handleDependencyToggle = (depId: string) => {
        const current = field.computation?.dependencies ?? [];
        const next = current.includes(depId)
            ? current.filter((d) => d !== depId)
            : [...current, depId];
        onUpdate(field.id, {
            computation: { ...(field.computation ?? { operation: "average" }), dependencies: next },
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
                    disabled={field.readOnly}
                    onClick={toggleComputed}
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                        field.readOnly
                            ? "opacity-50 cursor-not-allowed"
                            : field.is_computed
                              ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200 dark:bg-slate-800"
                    }`}
                    title={field.is_computed ? "Computed field" : "Make computed"}
                >
                    <Sigma className="h-3.5 w-3.5" />
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
                    <CanonicalKeyInput
                        value={field.canonical_key ?? null}
                        onChange={(value) => onUpdate(field.id, { canonical_key: value })}
                        suggestions={canonicalKeySuggestions}
                        disabled={field.readOnly}
                        duplicateWith={duplicateWith}
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
                        list={analyticsGroupDatalistId}
                        className="h-8 text-sm bg-white"
                    />
                    {analyticsGroupSuggestions.length > 0 && (
                        <datalist id={analyticsGroupDatalistId}>
                            {analyticsGroupSuggestions.map((group) => (
                                <option key={group} value={group} />
                            ))}
                        </datalist>
                    )}
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

        {showComputed && field.is_computed && (
            <div className="mt-3 rounded-md bg-purple-50 p-3 space-y-3">
                <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wide">Computed Field Configuration</p>
                <div className="grid grid-cols-12 gap-3">
                    <div className="col-span-4 space-y-1">
                        <p className="text-[11px] font-medium text-muted-foreground">Operation</p>
                        <Select
                            value={field.computation?.operation ?? "average"}
                            onValueChange={(value) =>
                                onUpdate(field.id, {
                                    computation: {
                                        operation: value as "average" | "sum" | "max" | "min",
                                        dependencies: field.computation?.dependencies ?? [],
                                    },
                                })
                            }
                            disabled={field.readOnly}
                        >
                            <SelectTrigger className="h-8 text-sm bg-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="average">Average</SelectItem>
                                <SelectItem value="sum">Sum</SelectItem>
                                <SelectItem value="max">Max</SelectItem>
                                <SelectItem value="min">Min</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-1">
                    <p className="text-[11px] font-medium text-muted-foreground">Dependencies</p>
                    <div className="max-h-32 overflow-y-auto rounded-md border border-slate-200 bg-white p-2 space-y-0.5">
                        {allFields
                            .filter((f) => f.id !== field.id && (f.type === "number" || f.type === "integer"))
                            .map((f) => {
                                const checked = (field.computation?.dependencies ?? []).includes(f.id);
                                return (
                                    <label
                                        key={f.id}
                                        className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-slate-50 cursor-pointer text-xs"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => handleDependencyToggle(f.id)}
                                            disabled={field.readOnly}
                                            className="h-3.5 w-3.5 rounded accent-purple-600"
                                        />
                                        <span className="text-slate-700 font-medium">{f.key || f.id}</span>
                                        <span className="text-slate-400 ml-auto text-[10px]">{f.type}</span>
                                    </label>
                                );
                            })}
                        {allFields.filter((f) => f.id !== field.id && (f.type === "number" || f.type === "integer")).length === 0 && (
                            <p className="text-[10px] text-slate-400 py-1 px-1.5">No other fields available</p>
                        )}
                    </div>
                </div>
            </div>
        )}
        </div>
    );
}
