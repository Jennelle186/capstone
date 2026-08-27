import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BucketConfig } from "@/types/extractionSchema";

export default function BucketEditor({
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
