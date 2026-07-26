import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { Layers, Loader2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import PageHeader from "@/components/admin/document-management/PageHeader";
import { staggerContainer } from "@/components/admin/motion-variants";
import { parseDocumentManagementApiError, toDocumentTypeItem } from "@/lib/document-management-utils";
import { fetchWithClerkAuth } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
import type { DocumentTypeApiRecord, DocumentTypeItem } from "@/types/documentType";
import type {
    RequirementSlot,
    SlotAssignment,
    SlotAssignmentPayload,
} from "@/types/requirement";
import type { SchoolYearRecord } from "@/types/schoolYear";
import RequirementsSchoolYearControls from "./RequirementsSchoolYearControls";

export default function RequirementsPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>([]);
    const [extractionSchemas, setExtractionSchemas] = useState<ExtractionSchemaRecord[]>([]);
    const [schoolYears, setSchoolYears] = useState<SchoolYearRecord[]>([]);
    const [selectedSchoolYearId, setSelectedSchoolYearId] = useState<string>("");
    const [_slots, setSlots] = useState<RequirementSlot[]>([]);
    const [draftSlots, setDraftSlots] = useState<SlotAssignment[]>([]);
    const [isPageLoading, setIsPageLoading] = useState(true);
    const [isSlotsLoading, setIsSlotsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

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

    const loadPageData = useCallback(async () => {
        setIsPageLoading(true);
        try {
            const [docTypePayload, syPayload, schemaPayload] = await Promise.all([
                requestWithAdminAuth("/api/admin/document-types?status=all"),
                requestWithAdminAuth("/api/admin/school-years"),
                requestWithAdminAuth("/api/admin/extraction-schemas?status=all"),
            ]);
            setDocumentTypes((docTypePayload as DocumentTypeApiRecord[]).map(toDocumentTypeItem));
            setSchoolYears(syPayload as SchoolYearRecord[]);
            setExtractionSchemas(
                ((schemaPayload as ExtractionSchemaRecord[]) || []).filter((s) => s.status !== "archived"),
            );
            const defaultSyId =
                (syPayload as SchoolYearRecord[]).find((sy) => sy.is_active)?.id ??
                (syPayload as SchoolYearRecord[])[0]?.id ??
                "";
            setSelectedSchoolYearId(defaultSyId);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load page data.");
        } finally {
            setIsPageLoading(false);
        }
    }, [requestWithAdminAuth]);

    const loadSchoolYearSlots = useCallback(
        async (schoolYearId: string) => {
            setIsSlotsLoading(true);
            try {
                const data = (await requestWithAdminAuth(
                    `/api/admin/requirement-slots?school_year_id=${schoolYearId}`,
                )) as RequirementSlot[];
                setSlots(data);
                setDraftSlots(
                    data.map((slot) => ({
                        id: slot.id,
                        slot_type: slot.slot_type,
                        group_name: slot.group_name ?? undefined,
                        description: slot.description ?? undefined,
                        min_required: slot.min_required,
                        display_order: slot.display_order,
                        items: slot.items.map((item) => ({
                            id: item.id,
                            document_type_id: item.document_type_id,
                            extraction_schema_id: item.extraction_schema_id,
                            is_primary: item.is_primary,
                            display_order: item.display_order,
                        })),
                    })),
                );
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to load slots.");
            } finally {
                setIsSlotsLoading(false);
            }
        },
        [requestWithAdminAuth],
    );

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) {
            setIsPageLoading(false);
            return;
        }
        void loadPageData();
    }, [isLoaded, isSignedIn, loadPageData]);

    useEffect(() => {
        if (!selectedSchoolYearId) {
            setSlots([]);
            setDraftSlots([]);
            return;
        }
        void loadSchoolYearSlots(selectedSchoolYearId);
    }, [selectedSchoolYearId, loadSchoolYearSlots]);

    const selectedSchoolYear = useMemo(
        () => schoolYears.find((s) => s.id === selectedSchoolYearId) ?? null,
        [schoolYears, selectedSchoolYearId],
    );
    const isClosed = selectedSchoolYear?.status === "closed";

    const activeDocTypes = useMemo(
        () => documentTypes.filter((d) => !d.isArchived),
        [documentTypes],
    );

    const addSoloSlot = () => {
        if (isClosed) return;
        setDraftSlots((prev) => [
            ...prev,
            {
                id: `temp-solo-${Date.now()}-${prev.length}`,
                slot_type: "solo",
                display_order: prev.length,
                items: [],
            },
        ]);
    };

    const addGroupSlot = () => {
        if (isClosed) return;
        setDraftSlots((prev) => [
            ...prev,
            {
                id: `temp-group-${Date.now()}-${prev.length}`,
                slot_type: "group",
                group_name: "New Requirement Group",
                min_required: 1,
                display_order: prev.length,
                items: [],
            },
        ]);
    };

    const removeSlot = (index: number) => {
        if (isClosed) return;
        setDraftSlots((prev) => prev.filter((_, i) => i !== index));
    };

    const updateSlot = (index: number, patch: Partial<SlotAssignment>) => {
        if (isClosed) return;
        setDraftSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
    };

    const addItemToSlot = (slotIndex: number, documentTypeId: string) => {
        if (isClosed) return;
        setDraftSlots((prev) =>
            prev.map((slot, i) => {
                if (i !== slotIndex) return slot;
                const alreadyInSlot = slot.items.some(
                    (item) => item.document_type_id === documentTypeId,
                );
                if (alreadyInSlot) return slot;
                return {
                    ...slot,
                    items: [
                        ...slot.items,
                        {
                            document_type_id: documentTypeId,
                            extraction_schema_id: null,
                            is_primary: slot.items.length === 0,
                            display_order: slot.items.length,
                        },
                    ],
                };
            }),
        );
    };

    const removeItemFromSlot = (slotIndex: number, documentTypeId: string) => {
        if (isClosed) return;
        setDraftSlots((prev) =>
            prev.map((slot, i) => {
                if (i !== slotIndex) return slot;
                const remaining = slot.items.filter(
                    (item) => item.document_type_id !== documentTypeId,
                );
                if (remaining.length > 0 && !remaining.some((item) => item.is_primary)) {
                    remaining[0] = { ...remaining[0], is_primary: true };
                }
                return { ...slot, items: remaining };
            }),
        );
    };

    const updateItemSchema = (slotIndex: number, docTypeId: string, schemaId: string | null) => {
        if (isClosed) return;
        setDraftSlots((prev) =>
            prev.map((slot, i) => {
                if (i !== slotIndex) return slot;
                return {
                    ...slot,
                    items: slot.items.map((item) =>
                        item.document_type_id === docTypeId
                            ? { ...item, extraction_schema_id: schemaId }
                            : item,
                    ),
                };
            }),
        );
    };

    const handleSave = async () => {
        if (!selectedSchoolYearId || isSaving) return;
        if (isClosed) {
            toast.error("Closed school years are read-only.");
            return;
        }

        setIsSaving(true);
        try {
            const isTempId = (val: string) => typeof val === "string" && val.startsWith("temp-");
            const payload: SlotAssignmentPayload = {
                school_year_id: selectedSchoolYearId,
                slots: draftSlots.map((slot, idx) => {
                    const { id: _id, ...slotRest } = slot;
                    return {
                        ...slotRest,
                        ...(slot.id && !isTempId(slot.id) ? { id: slot.id } : {}),
                        display_order: idx,
                        items: slot.items.map((item, itemIdx) => {
                            const { id: _itemId, ...itemRest } = item;
                            return {
                                ...itemRest,
                                ...(item.id && !isTempId(item.id) ? { id: item.id } : {}),
                                display_order: itemIdx,
                            };
                        }),
                    };
                }),
            };

            const response = (await requestWithAdminAuth("/api/admin/requirement-slots", {
                method: "PUT",
                body: JSON.stringify(payload),
            })) as { school_year_id: string; slots: RequirementSlot[] };

            setSlots(response.slots);
            setDraftSlots(
                response.slots.map((slot) => ({
                    id: slot.id,
                    slot_type: slot.slot_type,
                    group_name: slot.group_name ?? undefined,
                    description: slot.description ?? undefined,
                    min_required: slot.min_required,
                    display_order: slot.display_order,
                    items: slot.items.map((item) => ({
                        id: item.id,
                        document_type_id: item.document_type_id,
                        extraction_schema_id: item.extraction_schema_id,
                        is_primary: item.is_primary,
                        display_order: item.display_order,
                    })),
                })),
            );

            toast.success(`Requirements for ${selectedSchoolYear?.name ?? "selected school year"} saved.`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to save slots.");
        } finally {
            setIsSaving(false);
        }
    };

    if (isPageLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading requirements...
            </div>
        );
    }

    return (
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="space-y-6">
            <PageHeader
                title="Requirements"
                subtitle="Manage required enrollment documents per school year."
                actions={
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={addSoloSlot} disabled={isClosed}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Solo
                        </Button>
                        <Button variant="outline" size="sm" onClick={addGroupSlot} disabled={isClosed}>
                            <Layers className="mr-2 h-4 w-4" />
                            Add Group
                        </Button>
                    </motion.div>
                }
            />

            <RequirementsSchoolYearControls
                schoolYears={schoolYears}
                selectedSchoolYearId={selectedSchoolYearId}
                isRequirementsLoading={isSlotsLoading}
                onSelectedSchoolYearChange={setSelectedSchoolYearId}
            />

            {isSlotsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading slots...
                </div>
            ) : draftSlots.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-16">
                        <Layers className="h-12 w-12 text-slate-300" />
                        <p className="text-sm font-medium text-slate-400">
                            No requirement slots configured for this school year.
                        </p>
                        <p className="text-xs text-slate-400">
                            Click "Add Solo" or "Add Group" above to get started.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-4">
                    {draftSlots.map((slot, slotIndex) => {
                        const isSolo = slot.slot_type === "solo";
                        return (
                            <Card key={slot.id ?? slotIndex} className="border border-slate-200 shadow-sm">
                                <CardHeader className="pb-2">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="text-[11px] font-semibold uppercase">
                                                    {isSolo ? "Solo" : "Group"}
                                                </Badge>
                                                {!isSolo && (
                                                    <Input
                                                        className="h-8 w-64 text-sm font-semibold"
                                                        value={slot.group_name ?? ""}
                                                        placeholder="Group name (e.g., Proof of Financial Status)"
                                                        onChange={(e) =>
                                                            updateSlot(slotIndex, { group_name: e.target.value })
                                                        }
                                                        disabled={isClosed}
                                                    />
                                                )}
                                                {isSolo && (
                                                    <span className="text-sm font-semibold text-slate-900">
                                                        {slot.items[0]
                                                            ? activeDocTypes.find(
                                                                  (d) => d.id === slot.items[0].document_type_id,
                                                              )?.name ?? "Select a document type"
                                                            : "Solo Requirement"}
                                                    </span>
                                                )}
                                            </div>
                                            {!isSolo && (slot.min_required ?? 0) > 0 && (
                                                <p className="text-xs text-muted-foreground">
                                                    Student must submit {slot.min_required} of{" "}
                                                    {slot.items.length} alternative document type
                                                    {slot.items.length !== 1 ? "s" : ""}.
                                                </p>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                            onClick={() => removeSlot(slotIndex)}
                                            disabled={isClosed}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {isSolo && slot.items.length === 0 && (
                                        <Select
                                            onValueChange={(val) => addItemToSlot(slotIndex, val)}
                                            disabled={isClosed}
                                        >
                                            <SelectTrigger className="w-full">
                                                <SelectValue placeholder="Select a document type..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {activeDocTypes
                                                    .filter(
                                                        (d) =>
                                                            !draftSlots.some((s, si) =>
                                                                si !== slotIndex &&
                                                                s.items.some(
                                                                    (item) => item.document_type_id === d.id,
                                                                ),
                                                            ),
                                                    )
                                                    .map((d) => (
                                                        <SelectItem key={d.id} value={d.id}>
                                                            {d.name} <span className="text-xs text-slate-400">({d.code})</span>
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    )}

                                    {slot.items.map((item) => {
                                        const docType = activeDocTypes.find((d) => d.id === item.document_type_id);
                                        const relevantSchemas = extractionSchemas.filter(
                                            (s) =>
                                                !s.document_type_id ||
                                                s.document_type_id === item.document_type_id,
                                        );
                                        return (
                                            <div
                                                key={item.document_type_id}
                                                className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 truncate">
                                                        {docType?.name ?? "Unknown"}
                                                    </p>
                                                    <p className="text-xs text-slate-400">{docType?.code}</p>
                                                </div>
                                                {isSolo && (
                                                    <Select
                                                        value={item.extraction_schema_id ?? "__none__"}
                                                        onValueChange={(val) =>
                                                            updateItemSchema(slotIndex, item.document_type_id, val === "__none__" ? null : val)
                                                        }
                                                        disabled={isClosed}
                                                    >
                                                        <SelectTrigger className="w-48 text-xs">
                                                            <SelectValue placeholder="No schema" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="__none__">No schema</SelectItem>
                                                            {relevantSchemas.map((schema) => (
                                                                <SelectItem key={schema.id} value={schema.id}>
                                                                    {schema.name}
                                                                    {schema.version_label ? ` (${schema.version_label})` : ""}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                {!isSolo && (
                                                    <div className="flex items-center gap-2">
                                                        <Select
                                                            value={item.extraction_schema_id ?? "__none__"}
                                                            onValueChange={(val) =>
                                                                updateItemSchema(
                                                                    slotIndex,
                                                                    item.document_type_id,
                                                                    val === "__none__" ? null : val,
                                                                )
                                                            }
                                                            disabled={isClosed}
                                                        >
                                                            <SelectTrigger className="w-36 text-xs">
                                                                <SelectValue placeholder="No schema" />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="__none__">No schema</SelectItem>
                                                                {relevantSchemas.map((schema) => (
                                                                    <SelectItem key={schema.id} value={schema.id}>
                                                                        {schema.name}
                                                                        {schema.version_label ? ` (${schema.version_label})` : ""}
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                                    onClick={() => removeItemFromSlot(slotIndex, item.document_type_id)}
                                                    disabled={isClosed}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        );
                                    })}

                                    {!isSolo && (
                                        <Select
                                            onValueChange={(val) => addItemToSlot(slotIndex, val)}
                                            disabled={isClosed}
                                        >
                                            <SelectTrigger className="w-full border-dashed text-xs">
                                                <SelectValue placeholder="+ Add document type to this group..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {activeDocTypes
                                                    .filter(
                                                        (d) =>
                                                            !draftSlots.some((s, si) =>
                                                                si !== slotIndex &&
                                                                s.items.some(
                                                                    (item) => item.document_type_id === d.id,
                                                                ),
                                                            ) &&
                                                            !slot.items.some(
                                                                (item) => item.document_type_id === d.id,
                                                            ),
                                                    )
                                                    .map((d) => (
                                                        <SelectItem key={d.id} value={d.id}>
                                                            {d.name}{" "}
                                                            <span className="text-xs text-slate-400">
                                                                ({d.code})
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}

                    <div className="flex items-center gap-3 pt-4">
                        <Button onClick={() => void handleSave()} disabled={isSaving || isClosed}>
                            {isSaving ? "Saving..." : "Save Requirements"}
                        </Button>
                    </div>
                </div>
            )}
        </motion.div>
    );
}
