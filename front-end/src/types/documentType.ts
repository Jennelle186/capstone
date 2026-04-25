export type DocumentTypeStatus = "active" | "archived";

export interface DocumentTypeItem {
    id: string;
    name: string;
    code: string;
    description: string;
    classifierDescription: string;
    keywords: string[];
    isActive: boolean;
    isArchived: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface DocumentTypeFormState {
    name: string;
    code: string;
    description: string;
    classifierDescription: string;
    keywords: string[];
    isActive: boolean;
}

export type DocumentTypeFilterStatus = "active" | "archived" | "all";

export interface DocumentTypeApiRecord {
    id: string;
    name: string;
    code: string;
    description: string;
    classifier_description: string | null;
    keywords: string[];
    status: DocumentTypeStatus;
    created_at: string;
    updated_at: string;
}

export interface DocumentTypeUpsertPayload {
    name: string;
    code: string;
    description: string;
    classifier_description: string | null;
    keywords: string[];
    status: DocumentTypeStatus;
}
