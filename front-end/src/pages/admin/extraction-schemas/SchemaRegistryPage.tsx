import { useAuth } from "@clerk/clerk-react";
import { motion } from "framer-motion";
import { ChevronDown, ExternalLink, FileJson, FileText, ListFilter, Loader2, Pencil, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import PageHeader from "@/components/admin/document-management/PageHeader";
import { fadeInUp, staggerContainer } from "@/components/admin/motion-variants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchWithClerkAuth } from "@/lib/api";
import { parseDocumentManagementApiError } from "@/lib/document-management-utils";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";
import type { SchemaRegistryEntry, SchemaRegistryResponse } from "@/types/schemaRegistry";

export default function SchemaRegistryPage() {
    const { getToken, isLoaded, isSignedIn } = useAuth();
    const navigate = useNavigate();
    const [entries, setEntries] = useState<SchemaRegistryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dialogSchema, setDialogSchema] = useState<ExtractionSchemaRecord | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogLoading, setDialogLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [extractionFilter, setExtractionFilter] = useState<"all" | "structured" | "classification">("all");
    const [schoolYearFilter, setSchoolYearFilter] = useState<string>("all");
    const [expandedDocTypes, setExpandedDocTypes] = useState<Set<string>>(new Set());

    const toggleExpand = (docTypeId: string) => {
        setExpandedDocTypes((prev) => {
            const next = new Set(prev);
            if (next.has(docTypeId)) {
                next.delete(docTypeId);
            } else {
                next.add(docTypeId);
            }
            return next;
        });
    };

    const schoolYearOptions = useMemo(() => {
        const seen = new Set<string>();
        const options: { id: string; name: string }[] = [];
        for (const entry of entries) {
            for (const req of entry.requirements) {
                if (!seen.has(req.school_year_id)) {
                    seen.add(req.school_year_id);
                    options.push({ id: req.school_year_id, name: req.school_year_name });
                }
            }
        }
        return options.sort((a, b) => a.name.localeCompare(b.name));
    }, [entries]);

    const filteredEntries = useMemo(() => {
        let result = entries;
        if (extractionFilter === "structured") {
            result = result.filter((e) => e.extraction_type === "structured");
        } else if (extractionFilter === "classification") {
            result = result.filter((e) => e.extraction_type === "none");
        }
        if (schoolYearFilter !== "all") {
            result = result.filter((e) =>
                e.requirements.some((r) => r.school_year_id === schoolYearFilter),
            );
        }
        const q = searchQuery.trim().toLowerCase();
        if (q) {
            result = result.filter(
                (e) =>
                    e.document_type_name.toLowerCase().includes(q) ||
                    e.document_type_code.toLowerCase().includes(q) ||
                    e.schemas.some((s) => s.name.toLowerCase().includes(q)),
            );
        }
        return result;
    }, [entries, searchQuery, extractionFilter, schoolYearFilter]);

    const SHOW_SCHEMA_COUNT = 3;

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

    const loadRegistry = useCallback(async () => {
        setIsLoading(true);
        try {
            const payload = (await requestWithAdminAuth(
                "/api/admin/schema-registry",
            )) as SchemaRegistryResponse;
            setEntries(payload.entries);
        } catch (error) {
            console.error("Failed to load schema registry:", error);
            toast.error(error instanceof Error ? error.message : "Failed to load schema registry.");
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
        void loadRegistry();
    }, [isLoaded, isSignedIn, loadRegistry]);

    const { structuredCount, classificationOnlyCount } = useMemo(() => {
        const structured = entries.filter((e) => e.extraction_type === "structured").length;
        return { structuredCount: structured, classificationOnlyCount: entries.length - structured };
    }, [entries]);

    function schemaCounts(schemas: SchemaRegistryEntry["schemas"]) {
        const active = schemas.filter((s) => s.status === "active").length;
        const draft = schemas.filter((s) => s.status === "draft").length;
        const archived = schemas.filter((s) => s.status === "archived").length;
        return { active, draft, archived };
    }

    async function handleSchemaClick(schemaId: string) {
        setDialogLoading(true);
        setDialogOpen(true);
        try {
            const data = (await requestWithAdminAuth(
                `/api/admin/extraction-schemas/${schemaId}`,
            )) as ExtractionSchemaRecord;
            setDialogSchema(data);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to load schema details.");
            setDialogOpen(false);
        } finally {
            setDialogLoading(false);
        }
    }

    function handleOpenInBuilder(schemaId: string) {
        setDialogOpen(false);
        navigate(`/admin/extraction-schemas?s=${schemaId}`);
    }

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading schema registry...
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <motion.div
                initial="hidden"
                animate="visible"
                variants={staggerContainer}
                className="space-y-6"
            >
                <PageHeader
                    title="Schema Registry"
                    subtitle="Overview of document types, their extraction capabilities, and school year assignments."
                />
                <motion.div variants={fadeInUp} className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
                    <FileJson className="h-10 w-10" />
                    <p className="text-lg font-medium">No document types found</p>
                    <p className="text-sm">Create document types and extraction schemas to see them here.</p>
                </motion.div>
            </motion.div>
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
                title="Schema Registry"
                subtitle="Overview of document types, their extraction capabilities, and school year assignments."
            />

            <motion.div variants={fadeInUp}>
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3 text-sm">
                    <span className="font-medium text-foreground">
                        {entries.length} document type{entries.length !== 1 ? "s" : ""}
                    </span>
                    <span className="text-muted-foreground">&middot;</span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {structuredCount} structured extraction
                    </span>
                    <span className="text-muted-foreground">&middot;</span>
                    <span className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-slate-400" />
                        {classificationOnlyCount} classification-only
                    </span>
                </div>
            </motion.div>

            <motion.div variants={fadeInUp}>
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder="Search by name, code, or schema..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 pl-9 text-sm rounded-lg"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <ListFilter className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Select
                            value={extractionFilter}
                            onValueChange={(v) => setExtractionFilter(v as typeof extractionFilter)}
                        >
                            <SelectTrigger className="h-9 w-[170px] text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All ({entries.length})</SelectItem>
                                <SelectItem value="structured" className="text-xs">Structured ({structuredCount})</SelectItem>
                                <SelectItem value="classification" className="text-xs">Classification Only ({classificationOnlyCount})</SelectItem>
                            </SelectContent>
                        </Select>
                        <Select
                            value={schoolYearFilter}
                            onValueChange={setSchoolYearFilter}
                        >
                            <SelectTrigger className="h-9 w-[180px] text-xs">
                                <SelectValue placeholder="School Year" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all" className="text-xs">All School Years</SelectItem>
                                {schoolYearOptions.map((sy) => (
                                    <SelectItem key={sy.id} value={sy.id} className="text-xs">{sy.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </motion.div>

            {filteredEntries.length === 0 ? (
                <motion.div variants={fadeInUp} className="flex flex-col items-center gap-3 py-20 text-muted-foreground">
                    <FileJson className="h-10 w-10" />
                    <p className="text-lg font-medium">No matching document types</p>
                    <p className="text-sm">Try adjusting your search or filter.</p>
                </motion.div>
            ) : null}

            <motion.div variants={fadeInUp} className="space-y-4">
                {filteredEntries.map((entry) => {
                    const counts = schemaCounts(entry.schemas);
                    const nonArchivedSchemas = entry.schemas.filter((s) => s.status !== "archived");
                    const archivedSchemas = entry.schemas.filter((s) => s.status === "archived");
                    const allSchemas = [...nonArchivedSchemas, ...archivedSchemas];
                    const isExpanded = expandedDocTypes.has(entry.document_type_id);
                    const displayedSchemas = isExpanded ? allSchemas : allSchemas.slice(0, SHOW_SCHEMA_COUNT);

                    return (
                        <Card key={entry.document_type_id}>
                            <CardHeader className="pb-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-cyan-700" />
                                            <CardTitle className="text-lg">{entry.document_type_name}</CardTitle>
                                        </div>
                                        <CardDescription>
                                            Code: <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">{entry.document_type_code}</code>
                                        </CardDescription>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {entry.extraction_type === "structured" ? (
                                            <Badge className="bg-emerald-600 hover:bg-emerald-600">Structured Extraction</Badge>
                                        ) : (
                                            <Badge variant="secondary">Classification Only</Badge>
                                        )}
                                        <Badge variant={entry.status === "active" ? "default" : "outline"}>
                                            {entry.status}
                                        </Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div>
                                    <div className="mb-2 flex items-center justify-between">
                                        <h4 className="text-sm font-semibold text-muted-foreground">
                                            Schemas ({entry.schemas.length})
                                        </h4>
                                        {(counts.active > 0 || counts.draft > 0) ? (
                                            <span className="text-xs text-muted-foreground">
                                                {[
                                                    counts.active > 0 && `${counts.active} active`,
                                                    counts.draft > 0 && `${counts.draft} draft`,
                                                    counts.archived > 0 && `${counts.archived} archived`,
                                                ]
                                                    .filter(Boolean)
                                                    .join(", ")}
                                            </span>
                                        ) : null}
                                    </div>
                                    {allSchemas.length > 0 ? (
                                        <div className="space-y-2">
                                            {displayedSchemas.map((schema) => {
                                                const isArchived = schema.status === "archived";
                                                return (
                                                    <button
                                                        key={schema.id}
                                                        type="button"
                                                        onClick={() => void handleSchemaClick(schema.id)}
                                                        className={`flex w-full flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm text-left cursor-pointer transition-all ${
                                                            isArchived
                                                                ? "opacity-50 hover:opacity-70 bg-background"
                                                                : "bg-muted/30 hover:bg-muted/50"
                                                        }`}
                                                    >
                                                        <FileJson className={`h-3.5 w-3.5 shrink-0 ${isArchived ? "text-muted-foreground" : "text-cyan-700"}`} />
                                                        <span className={`font-medium ${isArchived ? "text-muted-foreground" : ""}`}>{schema.name}</span>
                                                        {schema.version_label ? (
                                                            <span className="text-xs text-muted-foreground">
                                                                v{schema.version_label}
                                                            </span>
                                                        ) : null}
                                                        <Badge
                                                            variant={
                                                                isArchived
                                                                    ? "outline"
                                                                    : schema.status === "active"
                                                                        ? "default"
                                                                        : "secondary"
                                                            }
                                                            className="ml-auto text-[10px]"
                                                        >
                                                            {schema.status}
                                                        </Badge>
                                                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                                                    </button>
                                                );
                                            })}
                                            {allSchemas.length > SHOW_SCHEMA_COUNT ? (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleExpand(entry.document_type_id)}
                                                    className="flex w-full items-center justify-center gap-1 rounded-md border border-dashed px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/30 cursor-pointer transition-colors"
                                                >
                                                    {isExpanded
                                                        ? "Show less"
                                                        : `Show ${allSchemas.length - SHOW_SCHEMA_COUNT} more`}
                                                </button>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No schemas assigned.</p>
                                    )}
                                </div>

                                <div>
                                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
                                        Used In ({entry.requirements.length} school year{entry.requirements.length !== 1 ? "s" : ""})
                                    </h4>
                                    {entry.requirements.length > 0 ? (
                                        <div className="space-y-1.5">
                                            {entry.requirements.map((req) => (
                                                <div
                                                    key={`${req.school_year_id}-${req.extraction_schema_id ?? "none"}`}
                                                    className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm"
                                                >
                                                    <span className="font-medium">{req.school_year_name}</span>
                                                    <span className="text-muted-foreground">&rarr;</span>
                                                    {req.extraction_schema_name ? (
                                                        <>
                                                            <span>{req.extraction_schema_name}</span>
                                                            <Badge className="bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/20 text-[10px]">
                                                                Structured
                                                            </Badge>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="italic text-muted-foreground">No schema assigned</span>
                                                            <Badge variant="secondary" className="text-[10px]">
                                                                Classification only
                                                            </Badge>
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            Not required by any school year.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    );
                })}
            </motion.div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="!max-w-[95vw] !max-h-[95vh] flex flex-col">
                    {dialogLoading ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" />
                            Loading schema details...
                        </div>
                    ) : dialogSchema ? (
                        <>
                            <DialogHeader className="shrink-0">
                                <div className="flex items-center gap-2">
                                    <DialogTitle>{dialogSchema.name}</DialogTitle>
                                    {dialogSchema.version_label ? (
                                        <span className="text-xs text-muted-foreground">v{dialogSchema.version_label}</span>
                                    ) : null}
                                    <Badge
                                        variant={
                                            dialogSchema.status === "active"
                                                ? "default"
                                                : dialogSchema.status === "archived"
                                                    ? "outline"
                                                    : "secondary"
                                        }
                                    >
                                        {dialogSchema.status}
                                    </Badge>
                                </div>
                            </DialogHeader>

                            <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
                                <div className="flex w-[60%] flex-col gap-3 overflow-y-auto pr-2">
                                    <DialogDescription className="text-sm">
                                        {dialogSchema.description ?? "No description."}
                                    </DialogDescription>

                                    {dialogSchema.source_file_name || dialogSchema.generation_prompt ? (
                                        <Collapsible defaultOpen={false} className="rounded-md border">
                                            <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer bg-muted/30">
                                                <ChevronDown className="h-3.5 w-3.5 shrink-0 transition-transform ui-open:rotate-0 -rotate-90" />
                                                Generation Info
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                                <div className="space-y-3 px-3 pb-3 pt-2 text-sm">
                                                    {dialogSchema.source_file_name ? (
                                                        <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-2">
                                                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                            <span className="text-muted-foreground">{dialogSchema.source_file_name}</span>
                                                        </div>
                                                    ) : null}
                                                    {dialogSchema.generation_prompt ? (
                                                        <div>
                                                            <div className="mb-1 text-xs font-medium text-muted-foreground">PROMPT</div>
                                                            <pre className="whitespace-pre-wrap rounded-md border bg-background px-3 py-2 text-xs font-mono text-foreground leading-relaxed">
                                                                {dialogSchema.generation_prompt}
                                                            </pre>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    ) : null}

                                    <div className="flex min-h-0 flex-1 flex-col">
                                        <h4 className="mb-2 text-sm font-semibold text-muted-foreground shrink-0">
                                            Fields ({dialogSchema.fields_json.length})
                                        </h4>
                                        {dialogSchema.fields_json.length > 0 ? (
                                            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="bg-muted/50 text-left text-xs font-medium text-muted-foreground sticky top-0">
                                                            <th className="px-3 py-2">Key</th>
                                                            <th className="px-3 py-2">Type</th>
                                                            <th className="px-3 py-2">Description</th>
                                                            <th className="px-3 py-2 w-20 text-center">Required</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {dialogSchema.fields_json.map((field) => (
                                                            <tr key={field.id} className="border-t">
                                                                <td className="px-3 py-2 font-mono text-xs">{field.key}</td>
                                                                <td className="px-3 py-2">
                                                                    <Badge variant="outline" className="text-[10px]">
                                                                        {field.type}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-3 py-2 text-muted-foreground">{field.description || "—"}</td>
                                                                <td className="px-3 py-2 text-center">
                                                                    {field.required ? (
                                                                        <span className="text-emerald-600 font-medium">Yes</span>
                                                                    ) : (
                                                                        <span className="text-muted-foreground">No</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">No fields defined.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex w-[40%] flex-col border-l pl-4">
                                    <h4 className="mb-2 text-sm font-semibold text-muted-foreground shrink-0">
                                        JSON Schema
                                    </h4>
                                    {dialogSchema.schema_json &&
                                        typeof dialogSchema.schema_json === "object" &&
                                        Object.keys(dialogSchema.schema_json).length > 0 ? (
                                        <pre className="min-h-0 flex-1 overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono text-foreground whitespace-pre-wrap">
                                            {JSON.stringify(dialogSchema.schema_json, null, 2)}
                                        </pre>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">No JSON schema defined.</p>
                                    )}
                                </div>
                            </div>
                            <DialogFooter className="shrink-0 border-t px-6 py-4 flex-row justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
                                    Close
                                </Button>
                                <Button size="sm" onClick={() => handleOpenInBuilder(dialogSchema.id)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    Open in Builder
                                </Button>
                            </DialogFooter>
                        </>
                    ) : null}
                </DialogContent>
            </Dialog>
        </motion.div>
    );
}
