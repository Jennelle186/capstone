import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { AlertTriangle, FileText, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import EmptyState from "@/components/admin/document-management/EmptyState";
import DocumentTypeForm from "@/components/admin/document-management/DocumentTypeForm";
import DocumentTypesTable from "@/components/admin/document-management/DocumentTypesTable";
import FilterCard from "@/components/admin/document-management/FilterCard";
import PageHeader from "@/components/admin/document-management/PageHeader";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import {
    normalizeDocumentTypeCode,
    normalizeKeyword,
    parseDocumentManagementApiError,
    toDocumentTypeItem,
    toDocumentTypeStatus,
} from "@/lib/document-management-utils";
import { fetchWithClerkAuth } from "@/lib/api";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogMedia,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
    DocumentTypeApiRecord,
    DocumentTypeFilterStatus,
    DocumentTypeFormState,
    DocumentTypeItem,
    DocumentTypeUpsertPayload,
} from "@/types/documentType";

function createDefaultFormState(): DocumentTypeFormState {
    return {
        name: "",
        code: "",
        description: "",
        classifierDescription: "",
        keywords: [],
        isActive: true,
    };
}

function isArchived(item: DocumentTypeItem): boolean {
    return item.isArchived || !item.isActive;
}

function buildSearchCorpus(item: DocumentTypeItem): string {
    return [
        item.name,
        item.code,
        item.description,
        item.classifierDescription,
        item.keywords.join(" "),
    ]
        .join(" ")
        .toLowerCase();
}

export default function DocumentTypesPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isArchiveActionPending, setIsArchiveActionPending] = useState(false);

    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<DocumentTypeFilterStatus>("active");

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingDocumentType, setEditingDocumentType] = useState<DocumentTypeItem | null>(null);
    const [formState, setFormState] = useState<DocumentTypeFormState>(createDefaultFormState);
    const [keywordInput, setKeywordInput] = useState("");
    const [formError, setFormError] = useState("");

    const [documentTypeToArchive, setDocumentTypeToArchive] = useState<DocumentTypeItem | null>(null);

    const requestWithAdminAuth = useCallback(
        async (path: string, init?: RequestInit): Promise<unknown> => {
            const token = await getToken();
            if (!token) throw new Error("Missing admin authentication token.");

            const response = await fetchWithClerkAuth(path, token, init);
            if (!response.ok) {
                let message = `Request failed with status ${response.status}.`;
                try {
                    const payload = (await response.json()) as unknown;
                    message = parseDocumentManagementApiError(payload, message);
                } catch {
                    // Ignore malformed payloads.
                }
                throw new Error(message);
            }
            return response.status === 204 ? null : ((await response.json()) as unknown);
        },
        [getToken],
    );

    const loadDocumentTypes = useCallback(async () => {
        setIsLoading(true);
        try {
            const payload = (await requestWithAdminAuth(
                "/api/admin/document-types?status=all",
            )) as DocumentTypeApiRecord[];
            setDocumentTypes(payload.map(toDocumentTypeItem));
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load document types.");
        } finally {
            setIsLoading(false);
        }
    }, [requestWithAdminAuth]);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setIsLoading(false);
            return;
        }
        void loadDocumentTypes();
    }, [isLoaded, isSignedIn, loadDocumentTypes]);

    const activeCount = useMemo(
        () => documentTypes.filter((item) => !isArchived(item)).length,
        [documentTypes],
    );
    const archivedCount = useMemo(
        () => documentTypes.filter((item) => isArchived(item)).length,
        [documentTypes],
    );

    const filteredDocumentTypes = useMemo(() => {
        const normalizedSearch = searchQuery.trim().toLowerCase();

        return documentTypes.filter((item) => {
            const archived = isArchived(item);
            const matchesStatusFilter =
                statusFilter === "all" ||
                (statusFilter === "active" && !archived) ||
                (statusFilter === "archived" && archived);

            if (!matchesStatusFilter) return false;
            if (!normalizedSearch) return true;
            return buildSearchCorpus(item).includes(normalizedSearch);
        });
    }, [documentTypes, searchQuery, statusFilter]);

    const resetForm = () => {
        setEditingDocumentType(null);
        setFormState(createDefaultFormState());
        setKeywordInput("");
        setFormError("");
    };

    const openCreateDialog = () => {
        resetForm();
        setIsFormOpen(true);
    };

    const openEditDialog = (item: DocumentTypeItem) => {
        setEditingDocumentType(item);
        setFormState({
            name: item.name,
            code: item.code,
            description: item.description,
            classifierDescription: item.classifierDescription,
            keywords: [...item.keywords],
            isActive: !isArchived(item),
        });
        setKeywordInput("");
        setFormError("");
        setIsFormOpen(true);
    };

    const handleFormOpenChange = (open: boolean) => {
        setIsFormOpen(open);
        if (!open) resetForm();
    };

    const handleAddKeyword = (rawKeyword: string) => {
        const normalized = normalizeKeyword(rawKeyword);
        if (!normalized) {
            setKeywordInput("");
            return;
        }

        setFormState((prev) => {
            if (prev.keywords.some((keyword) => keyword.toLowerCase() === normalized.toLowerCase())) {
                return prev;
            }
            return { ...prev, keywords: [...prev.keywords, normalized] };
        });
        setKeywordInput("");
    };

    const handleRemoveKeyword = (keywordToRemove: string) => {
        setFormState((prev) => ({
            ...prev,
            keywords: prev.keywords.filter((keyword) => keyword !== keywordToRemove),
        }));
    };

    const handleSubmit = async () => {
        if (isSaving) return;

        const name = formState.name.trim();
        const code = normalizeDocumentTypeCode(formState.code);
        const description = formState.description.trim();

        if (!name || !code || !description) {
            setFormError("Document name, code, and description are required.");
            return;
        }

        const hasDuplicateCode = documentTypes.some(
            (item) =>
                item.id !== editingDocumentType?.id &&
                item.code.toLowerCase() === code.toLowerCase(),
        );
        if (hasDuplicateCode) {
            setFormError("Document code already exists. Please use a unique code.");
            return;
        }

        const payload: DocumentTypeUpsertPayload = {
            name,
            code,
            description,
            classifier_description: formState.classifierDescription.trim() || null,
            keywords: [...formState.keywords],
            status: toDocumentTypeStatus(formState.isActive),
        };

        setIsSaving(true);
        try {
            if (editingDocumentType) {
                const response = (await requestWithAdminAuth(
                    `/api/admin/document-types/${editingDocumentType.id}`,
                    {
                        method: "PATCH",
                        body: JSON.stringify(payload),
                    },
                )) as DocumentTypeApiRecord;
                const nextItem = toDocumentTypeItem(response);
                setDocumentTypes((prev) =>
                    prev.map((item) => (item.id === nextItem.id ? nextItem : item)),
                );
                toast.success("Document type updated.");
            } else {
                const response = (await requestWithAdminAuth("/api/admin/document-types", {
                    method: "POST",
                    body: JSON.stringify(payload),
                })) as DocumentTypeApiRecord;
                const nextItem = toDocumentTypeItem(response);
                setDocumentTypes((prev) => [nextItem, ...prev]);
                toast.success("Document type created.");
            }

            setIsFormOpen(false);
            resetForm();
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to save document type.";
            setFormError(message);
            toast.error(message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleArchive = async () => {
        if (!documentTypeToArchive || isArchiveActionPending) return;

        setIsArchiveActionPending(true);
        try {
            const response = (await requestWithAdminAuth(
                `/api/admin/document-types/${documentTypeToArchive.id}`,
                {
                    method: "PATCH",
                    body: JSON.stringify({ status: "archived" }),
                },
            )) as DocumentTypeApiRecord;
            const nextItem = toDocumentTypeItem(response);
            setDocumentTypes((prev) =>
                prev.map((item) => (item.id === nextItem.id ? nextItem : item)),
            );
            toast.success(`${documentTypeToArchive.name} was archived.`);
            setDocumentTypeToArchive(null);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to archive document type.");
        } finally {
            setIsArchiveActionPending(false);
        }
    };

    const handleRestore = async (item: DocumentTypeItem) => {
        if (isSaving) return;

        try {
            const response = (await requestWithAdminAuth(`/api/admin/document-types/${item.id}`, {
                method: "PATCH",
                body: JSON.stringify({ status: "active" }),
            })) as DocumentTypeApiRecord;
            const nextItem = toDocumentTypeItem(response);
            setDocumentTypes((prev) =>
                prev.map((row) => (row.id === nextItem.id ? nextItem : row)),
            );
            toast.success(`${item.name} was restored.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to restore document type.");
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading document types...
            </div>
        );
    }

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="space-y-6"
        >
            <PageHeader
                title="Document Types"
                subtitle="Manage document type templates used across enrollment requirements."
                actions={(
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button onClick={openCreateDialog}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Document Type
                        </Button>
                    </motion.div>
                )}
            />

            <FilterCard
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                activeCount={activeCount}
                archivedCount={archivedCount}
                totalCount={documentTypes.length}
            />

            <motion.div variants={fadeInUp}>
                <Card>
                    <CardHeader>
                        <CardTitle>Document Type List</CardTitle>
                        <CardDescription>
                            Master list of all document categories available for school-wide requirements.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {filteredDocumentTypes.length === 0 ? (
                            <EmptyState
                                icon={<FileText className="h-6 w-6" />}
                                title="No document types found"
                                description="No records match your current search and filter. Add a document type to start building your requirement catalog."
                                action={(
                                    <Button onClick={openCreateDialog}>
                                        <Plus className="mr-2 h-4 w-4" />
                                        Add Document Type
                                    </Button>
                                )}
                            />
                        ) : (
                            <DocumentTypesTable
                                items={filteredDocumentTypes}
                                onEdit={openEditDialog}
                                onArchive={setDocumentTypeToArchive}
                                onRestore={(item) => {
                                    void handleRestore(item);
                                }}
                            />
                        )}
                    </CardContent>
                </Card>
            </motion.div>

            <DocumentTypeForm
                open={isFormOpen}
                mode={editingDocumentType ? "edit" : "create"}
                formState={formState}
                keywordInput={keywordInput}
                error={formError}
                onOpenChange={handleFormOpenChange}
                onFormStateChange={(next) => {
                    setFormError("");
                    setFormState(next);
                }}
                onKeywordInputChange={setKeywordInput}
                onKeywordAdd={handleAddKeyword}
                onKeywordRemove={handleRemoveKeyword}
                onSubmit={() => {
                    void handleSubmit();
                }}
            />

            <AlertDialog
                open={documentTypeToArchive !== null}
                onOpenChange={(open) => (!open ? setDocumentTypeToArchive(null) : null)}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogMedia className="bg-amber-100 text-amber-700">
                            <AlertTriangle className="h-5 w-5" />
                        </AlertDialogMedia>
                        <AlertDialogTitle>Archive Document Type?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {documentTypeToArchive
                                ? `${documentTypeToArchive.name} will be archived and hidden from active requirement selection until restored.`
                                : "This document type will be archived and can be restored later."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={isArchiveActionPending}
                            onClick={() => {
                                void handleArchive();
                            }}
                        >
                            {isArchiveActionPending ? "Archiving..." : "Confirm Archive"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {isSaving ? (
                <p className="text-sm text-muted-foreground">Saving document type...</p>
            ) : null}
        </motion.div>
    );
}
