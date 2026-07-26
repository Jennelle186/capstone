import { useState, useMemo } from "react";
import { Archive, CheckCircle2, Plus, Search, ChevronDown } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { statusLabel } from "@/lib/schema-utils";
import type { ExtractionSchemaRecord } from "@/types/extractionSchema";

interface SchemaSidebarProps {
    schemas: ExtractionSchemaRecord[];
    selectedSchemaId: string | null;
    onSchemaSelect: (schemaId: string) => void;
    onActivate: (schemaId: string) => void;
    onArchive: (schemaId: string) => void;
    onNewSchema: () => void;
    isActionPending: boolean;
}

const ITEMS_PER_PAGE = 10;

type StatusTab = "all" | "draft" | "active" | "archived";

const TABS: { value: StatusTab; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "draft", label: "Draft" },
    { value: "archived", label: "Archived" },
];

export default function SchemaSidebar({
    schemas,
    selectedSchemaId,
    onSchemaSelect,
    onActivate,
    onArchive,
    onNewSchema,
    isActionPending,
}: SchemaSidebarProps) {
    const [statusFilter, setStatusFilter] = useState<StatusTab>("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE);

    const counts = useMemo(() => {
        const all = schemas.length;
        const active = schemas.filter((s) => s.status === "active").length;
        const draft = schemas.filter((s) => s.status === "draft").length;
        const archived = schemas.filter((s) => s.status === "archived").length;
        return { all, active, draft, archived };
    }, [schemas]);

    const filtered = useMemo(() => {
        const statusMatch = statusFilter === "all"
            ? schemas
            : schemas.filter((s) => s.status === statusFilter);
        const sorted = [...statusMatch].sort((a, b) => {
            if (a.status === "archived" && b.status !== "archived") return 1;
            if (a.status !== "archived" && b.status === "archived") return -1;
            return 0;
        });
        const query = searchQuery.toLowerCase().trim();
        return query
            ? sorted.filter(
                  (s) =>
                      s.name.toLowerCase().includes(query) ||
                      (s.description ?? "").toLowerCase().includes(query),
              )
            : sorted;
    }, [schemas, statusFilter, searchQuery]);

    const paginated = filtered.slice(0, visibleCount);
    const hasMore = visibleCount < filtered.length;

    return (
        <div className="space-y-5">
            <Card className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 pb-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-bold text-slate-800">Available Schemas</CardTitle>
                            <CardDescription className="text-xs text-slate-400">Manage rules lists for document parsing</CardDescription>
                        </div>
                        <Button
                            onClick={onNewSchema}
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-lg text-primary hover:bg-emerald-50 hover:border-emerald-200 gap-1 px-2 cursor-pointer"
                        >
                            <Plus className="h-4 w-4" />
                            New
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-4 pb-0 space-y-3">
                    <Tabs
                        value={statusFilter}
                        onValueChange={(v) => {
                            setStatusFilter(v as StatusTab);
                            setVisibleCount(ITEMS_PER_PAGE);
                        }}
                    >
                        <TabsList className="w-full h-9">
                            {TABS.map((tab) => (
                                <TabsTrigger key={tab.value} value={tab.value} className="group text-xs px-2 py-1 gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                                    {tab.label}
                                    <span className="text-[10px] group-data-[state=active]:text-primary-foreground text-muted-foreground">({counts[tab.value]})</span>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            placeholder="Search schemas..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setVisibleCount(ITEMS_PER_PAGE);
                            }}
                            className="h-8 pl-8 text-xs"
                        />
                    </div>
                </CardContent>
                <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto border-t border-slate-100">
                    {paginated.length === 0 ? (
                        <p className="p-6 text-center text-xs text-muted-foreground">No schemas found.</p>
                    ) : (
                        paginated.map((schema) => {
                            const isSelected = selectedSchemaId === schema.id;
                            return (
                                <div
                                    key={schema.id}
                                    onClick={() => onSchemaSelect(schema.id)}
                                    className={`p-4 hover:bg-slate-50 transition-all cursor-pointer text-left relative flex flex-col gap-1.5 ${
                                        isSelected ? "bg-emerald-50/20 border-l-[3.5px] border-primary" : ""
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-800 mt-0.5">{schema.name}</h4>
                                            <p className="text-xs text-slate-500 line-clamp-1">
                                                {schema.description || "No description"}
                                            </p>
                                        </div>
                                        <span className="shrink-0 text-xs font-mono text-slate-400 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                                            {schema.version_label || "v1"}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between mt-1 gap-4">
                                        <Badge
                                            variant={schema.status === "active" ? "default" : "secondary"}
                                            className="text-[10px] px-2 py-0"
                                        >
                                            {statusLabel(schema.status)}
                                        </Badge>
                                        <div
                                            className="flex items-center gap-1 opacity-60 hover:opacity-100 transition"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {schema.status !== "active" && (
                                                <button
                                                    onClick={() => onActivate(schema.id)}
                                                    disabled={isActionPending}
                                                    className="text-[10px] bg-white border border-slate-200 rounded-md text-emerald-600 font-bold px-2 py-0.5 hover:bg-emerald-50 transition cursor-pointer"
                                                >
                                                    <CheckCircle2 className="h-3 w-3 inline mr-0.5" />
                                                    Activate
                                                </button>
                                            )}
                                            <button
                                                onClick={() => onArchive(schema.id)}
                                                disabled={isActionPending}
                                                className="text-slate-400 hover:text-red-500 p-1 cursor-pointer transition"
                                                title="Archive"
                                            >
                                                <Archive className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
                {hasMore && (
                    <div className="p-3 border-t border-slate-100">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisibleCount((prev) => prev + ITEMS_PER_PAGE)}
                            className="w-full text-xs text-muted-foreground hover:text-foreground gap-1"
                        >
                            <ChevronDown className="h-3.5 w-3.5" />
                            Show {Math.min(ITEMS_PER_PAGE, filtered.length - visibleCount)} more
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
}
