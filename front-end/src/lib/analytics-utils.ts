import { normalizeFieldKey } from "@/lib/schema-utils";
import type { CanonicalKeyItem } from "@/types/analytics";
import type { ExtractionSchemaField } from "@/types/extractionSchema";

export interface CanonicalKeySuggestion {
    item: CanonicalKeyItem;
    confidence: "exact" | "fuzzy";
}

export function findSuggestedKey(
    field: Pick<ExtractionSchemaField, "key" | "description">,
    suggestions: CanonicalKeyItem[],
): CanonicalKeySuggestion | null {
    const label = field.description?.trim() || field.key.trim();
    if (!label) return null;
    const normalizedLabel = normalizeFieldKey(label);

    for (const item of suggestions) {
        if (item.label === label || item.canonical_key === normalizeFieldKey(field.key)) {
            return { item, confidence: "exact" };
        }
    }
    for (const item of suggestions) {
        if (normalizeFieldKey(item.label) === normalizedLabel) {
            return { item, confidence: "exact" };
        }
    }
    const lowerLabel = label.toLowerCase();
    for (const item of suggestions) {
        const lowerItem = item.label.toLowerCase();
        if (lowerItem && (lowerItem.includes(lowerLabel) || lowerLabel.includes(lowerItem))) {
            return { item, confidence: "fuzzy" };
        }
    }
    return null;
}

export function findDuplicateCanonicalKeys(
    fields: Pick<ExtractionSchemaField, "id" | "key" | "is_analytics" | "canonical_key">[],
): Map<string, string[]> {
    const analyticsFields = fields.filter((field) => field.is_analytics && field.canonical_key);
    const normalizedToFields = new Map<string, typeof analyticsFields>();
    for (const field of analyticsFields) {
        const normalized = normalizeFieldKey(field.canonical_key as string);
        if (!normalized) continue;
        const bucket = normalizedToFields.get(normalized) ?? [];
        bucket.push(field);
        normalizedToFields.set(normalized, bucket);
    }

    const duplicateOwners = new Map<string, string[]>();
    for (const bucket of normalizedToFields.values()) {
        if (bucket.length < 2) continue;
        for (const field of bucket) {
            const others = bucket.filter((f) => f.id !== field.id).map((f) => f.key || f.canonical_key || "(unnamed)");
            duplicateOwners.set(field.id, others);
        }
    }
    return duplicateOwners;
}
