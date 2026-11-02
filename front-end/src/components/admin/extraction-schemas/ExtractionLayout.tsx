import { useState } from "react";
import { Play, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CanonicalKeyItem, CanonicalKeyRegistrationPayload } from "@/types/analytics";
import type { DocumentTypeApiRecord } from "@/types/documentType";
import type {
    ExtractionSchemaField,
    ExtractionSchemaPayload,
    ExtractionSchemaRecord,
} from "@/types/extractionSchema";
import SandboxTestingView from "./SandboxTestingView";
import SchemaBuilderView from "./SchemaBuilderView";
import SchemaSidebar from "./SchemaSidebar";

interface ExtractionLayoutProps {
    schemas: ExtractionSchemaRecord[];
    documentTypes: DocumentTypeApiRecord[];
    selectedSchemaId: string | null;
    formState: ExtractionSchemaPayload;
    sampleFiles: File[];
    samplePreviewUrls: string[];
    currentPageIndex: number;
    isSaving: boolean;
    saveLocked?: boolean;
    isGenerating: boolean;
    isActionPending: boolean;
    formError: string;
    isExtracting?: boolean;
    sandboxResponse?: unknown;
    onSchemaSelect: (schemaId: string) => void;
    onFieldUpdate: (fieldId: string, next: Partial<ExtractionSchemaField>) => void;
    onRemoveField: (fieldId: string) => void;
    onAddField: (afterFieldId?: string) => void;
    onAddSection: (afterFieldId?: string) => void;
    onFormStatePatch: (patch: Partial<ExtractionSchemaPayload>) => void;
    onDocumentTypeChange: (documentTypeId: string | null) => void;
    onSave: () => void;
    onGenerate: () => void;
    onAutoGenerate: (files: File[]) => void;
    onActivate: (schemaId: string) => void;
    onArchive: (schemaId: string) => void;
    onClearSampleFiles: () => void;
    onPageChange: (index: number) => void;
    onRemoveFileAt: (index: number) => void;
    onSampleFilesChange: (files: File[]) => void;
    onNewSchema: () => void;
    onRunExtraction?: () => void;
    canonicalKeySuggestions?: CanonicalKeyItem[];
    analyticsGroupSuggestions?: string[];
    onRegisterCanonicalKey?: (payload: CanonicalKeyRegistrationPayload) => Promise<CanonicalKeyItem>;
}

export default function ExtractionLayout(props: ExtractionLayoutProps) {
    const [activeTab, setActiveTab] = useState<"builder" | "sandbox">("builder");
    const [builderMaximized, setBuilderMaximized] = useState(false);
    const [sandboxMaximized, setSandboxMaximized] = useState(false);

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto pb-12" id="extraction-builder-root">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                    <h1 className="text-2xl font-bold text-foreground">Extraction Builder</h1>
                    <p className="text-muted-foreground">
                        Formulate schemas and test Gemini document models for academic file extractions.
                    </p>
                    <div className="mt-3 max-w-3xl rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 space-y-1.5">
                        <p className="font-semibold text-slate-800">What an extraction schema is for</p>
                        <p>
                            A schema tells the system which fields to read and save from each uploaded file of one
                            document type. For example, an admission form needs a name, a student number and a grade
                            saved, and the schema lists those fields. Each field's Label Name becomes its key.
                        </p>
                        <p>
                            Only one schema is active per document type, and the active one reads new uploads. Fields
                            marked for analytics feed the Analytics page and reports. Test a schema on a sample file
                            with Live File Testing before you activate it.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant={activeTab === "builder" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActiveTab("builder")}
                        className="rounded-xl px-4 cursor-pointer"
                    >
                        <Wrench className="h-4 w-4 mr-1.5" /> Schema Builder
                    </Button>
                    <Button
                        variant={activeTab === "sandbox" ? "default" : "outline"}
                        size="sm"
                        data-tour="schema-live-test"
                        onClick={() => setActiveTab("sandbox")}
                        className="rounded-xl px-4 cursor-pointer"
                    >
                        <Play className="h-4 w-4 mr-1.5" /> Live File Testing
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                <div className="lg:col-span-4">
                    <SchemaSidebar
                        schemas={props.schemas}
                        selectedSchemaId={props.selectedSchemaId}
                        onSchemaSelect={props.onSchemaSelect}
                        onActivate={props.onActivate}
                        onArchive={props.onArchive}
                        onNewSchema={props.onNewSchema}
                        isActionPending={props.isActionPending}
                    />
                </div>

                <div className="lg:col-span-8">
                    {activeTab === "builder" ? (
                        <SchemaBuilderView
                            formState={props.formState}
                            documentTypes={props.documentTypes}
                            selectedSchemaId={props.selectedSchemaId}
                            isSaving={props.isSaving}
                            saveLocked={props.saveLocked}
                            isGenerating={props.isGenerating}
                            isActionPending={props.isActionPending}
                            formError={props.formError}
                            maximized={builderMaximized}
                            onToggleMaximize={() => setBuilderMaximized(!builderMaximized)}
                            onFormStatePatch={props.onFormStatePatch}
                            onDocumentTypeChange={props.onDocumentTypeChange}
                            onSave={props.onSave}
                            onGenerate={props.onGenerate}
                            onAutoGenerate={props.onAutoGenerate}
                            onAddField={props.onAddField}
                            onAddSection={props.onAddSection}
                            onFieldUpdate={props.onFieldUpdate}
                            onRemoveField={props.onRemoveField}
                            canonicalKeySuggestions={props.canonicalKeySuggestions}
                            analyticsGroupSuggestions={props.analyticsGroupSuggestions}
                            onRegisterCanonicalKey={props.onRegisterCanonicalKey}
                        />
                    ) : (
                        <SandboxTestingView
                            sampleFiles={props.sampleFiles}
                            samplePreviewUrls={props.samplePreviewUrls}
                            currentPageIndex={props.currentPageIndex}
                            isExtracting={props.isExtracting ?? false}
                            sandboxResponse={props.sandboxResponse}
                            maximized={sandboxMaximized}
                            onToggleMaximize={() => setSandboxMaximized(!sandboxMaximized)}
                            onPageChange={props.onPageChange}
                            onSampleFilesChange={props.onSampleFilesChange}
                            onClearSampleFiles={props.onClearSampleFiles}
                            onRemoveFileAt={props.onRemoveFileAt}
                            onRunExtraction={props.onRunExtraction ?? (() => {})}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
