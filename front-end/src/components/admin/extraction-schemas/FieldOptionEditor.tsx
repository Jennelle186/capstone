import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeFieldKey } from "@/lib/schema-utils";
import type { ExtractionSchemaField } from "@/types/extractionSchema";

export default function FieldOptionEditor({
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
