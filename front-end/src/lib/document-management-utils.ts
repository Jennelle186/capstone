import type { DocumentTypeApiRecord, DocumentTypeItem, DocumentTypeStatus } from "@/types/documentType";

export function parseDocumentManagementApiError(payload: unknown, fallback: string): string {
    if (
        payload &&
        typeof payload === "object" &&
        "detail" in payload &&
        typeof (payload as { detail?: unknown }).detail === "string"
    ) {
        return (payload as { detail: string }).detail;
    }
    if (
        payload &&
        typeof payload === "object" &&
        "detail" in payload &&
        Array.isArray((payload as { detail?: unknown }).detail)
    ) {
        const details = (payload as { detail: Array<{ msg?: string }> }).detail;
        const firstMessage = details.find((item) => typeof item.msg === "string")?.msg;
        if (firstMessage) return firstMessage;
    }
    return fallback;
}

export function normalizeDocumentTypeCode(value: string): string {
    return value.trim().toUpperCase();
}

export function normalizeKeyword(value: string): string {
    return value.trim().replace(/\s+/g, " ");
}

export function toDocumentTypeItem(record: DocumentTypeApiRecord): DocumentTypeItem {
    const isArchived = record.status === "archived";
    return {
        id: record.id,
        name: record.name,
        code: record.code,
        description: record.description,
        classifierDescription: record.classifier_description ?? "",
        keywords: [...record.keywords],
        applicableClassifications: [...(record.applicable_classifications ?? [])],
        isActive: !isArchived,
        isArchived,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
    };
}

export function toDocumentTypeStatus(isActive: boolean): DocumentTypeStatus {
    return isActive ? "active" : "archived";
}
