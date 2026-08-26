import { useId, useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { normalizeFieldKey } from "@/lib/schema-utils";
import type { CanonicalKeyItem } from "@/types/analytics";

interface CanonicalKeyInputProps {
    value: string | null;
    onChange: (value: string | null) => void;
    suggestions: CanonicalKeyItem[];
    disabled?: boolean;
    duplicateWith?: string[];
}

export default function CanonicalKeyInput({
    value,
    onChange,
    suggestions,
    disabled = false,
    duplicateWith = [],
}: CanonicalKeyInputProps) {
    const datalistId = useId();

    const itemByKey = useMemo(() => {
        const lookup: Record<string, CanonicalKeyItem> = {};
        for (const item of suggestions) {
            lookup[normalizeFieldKey(item.canonical_key)] = item;
        }
        return lookup;
    }, [suggestions]);

    const matched = value ? itemByKey[normalizeFieldKey(value)] : undefined;
    const isDuplicate = duplicateWith.length > 0;

    let badge: { label: string; variant: "default" | "secondary" | "outline" } | null = null;
    if (value) {
        if (matched) {
            badge = matched.school_year_count > 1
                ? { label: `Aligned across ${matched.school_year_count} years`, variant: "default" }
                : { label: "Used in 1 year only: aligns when duplicated across years", variant: "secondary" };
        } else {
            badge = { label: "New key — not used in any other year", variant: "outline" };
        }
    }

    return (
        <div className="space-y-1">
            <Input
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value || null)}
                disabled={disabled}
                placeholder="e.g. gender, gpa"
                list={datalistId}
                className={`h-8 font-mono ${isDuplicate ? "border-destructive focus-visible:ring-destructive/50" : ""}`}
            />
            {suggestions.length > 0 && (
                <datalist id={datalistId}>
                    {suggestions.map((item) => (
                        <option key={item.canonical_key} value={item.canonical_key}>
                            {item.label}
                        </option>
                    ))}
                </datalist>
            )}
            {isDuplicate ? (
                <p className="text-[10px] font-medium text-destructive">
                    Duplicate: same key as &apos;{duplicateWith.join("', '")}&apos;. Each analytics field needs a unique key.
                </p>
            ) : (
                badge && (
                    <Badge variant={badge.variant} className="text-[10px]">
                        {badge.label}
                    </Badge>
                )
            )}
        </div>
    );
}
