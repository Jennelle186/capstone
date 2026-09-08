import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
} from "@/components/ui/combobox";
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
    const itemByKey = useMemo(() => {
        const lookup: Record<string, CanonicalKeyItem> = {};
        for (const item of suggestions) {
            lookup[normalizeFieldKey(item.canonical_key)] = item;
        }
        return lookup;
    }, [suggestions]);

    const labelByKey = useMemo(() => {
        const lookup: Record<string, string> = {};
        for (const item of suggestions) {
            lookup[item.canonical_key] = item.label;
        }
        return lookup;
    }, [suggestions]);

    // Selectable values come from the registry. If the current value is not yet
    // registered, still include it so it keeps rendering in the input while the
    // badge flags it as unregistered.
    const items = useMemo(() => {
        const keys = suggestions.map((item) => item.canonical_key);
        if (value && !keys.some((k) => normalizeFieldKey(k) === normalizeFieldKey(value))) {
            keys.push(value);
        }
        return keys;
    }, [suggestions, value]);

    const matched = value ? itemByKey[normalizeFieldKey(value)] : undefined;
    const isDuplicate = duplicateWith.length > 0;

    let badge: {
        label: string;
        variant: "default" | "secondary" | "destructive";
    } | null = null;
    if (value) {
        if (matched) {
            badge = matched.school_year_count > 1
                ? { label: `Aligned across ${matched.school_year_count} years`, variant: "default" }
                : { label: "Used in 1 year only: aligns when duplicated across years", variant: "secondary" };
        } else {
            badge = { label: "Not registered: add it to the registry to set label and group", variant: "destructive" };
        }
    }

    return (
        <div className="space-y-1">
            <Combobox
                items={items}
                value={value ?? null}
                onValueChange={(next) => onChange(next ? (next as string) : null)}
            >
                <ComboboxInput
                    placeholder="Search or type a canonical key..."
                    disabled={disabled}
                    className={isDuplicate ? "border-destructive" : ""}
                    onBlur={(event) => {
                        const raw = event.currentTarget.value;
                        const next = raw.trim();
                        onChange(next || null);
                    }}
                />
                <ComboboxContent>
                    <ComboboxEmpty>No registered keys yet. Type to enter a new key.</ComboboxEmpty>
                    <ComboboxList>
                        {(item) => (
                            <ComboboxItem key={item} value={item}>
                                <span className="truncate">{labelByKey[item] ?? item}</span>
                                <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                                    {item}
                                </span>
                            </ComboboxItem>
                        )}
                    </ComboboxList>
                </ComboboxContent>
            </Combobox>
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
