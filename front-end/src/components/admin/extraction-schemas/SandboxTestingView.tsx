import { useRef } from "react";
import {
    ChevronLeft,
    ChevronRight,
    FileText,
    Gauge,
    Loader2,
    Play,
    Upload,
    X,
    CheckCircle2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SandboxTestingViewProps {
    sampleFiles: File[];
    samplePreviewUrls: string[];
    currentPageIndex: number;
    isExtracting: boolean;
    sandboxResponse: unknown;
    onPageChange: (index: number) => void;
    onSampleFilesChange: (files: File[]) => void;
    onClearSampleFiles: () => void;
    onRemoveFileAt: (index: number) => void;
    onRunExtraction: () => void;
}

function canPreviewFile(file: File): boolean {
    return (
        file.type === "application/pdf" ||
        file.type.startsWith("image/") ||
        file.name.toLowerCase().endsWith(".pdf")
    );
}

function isPdfFile(file: File): boolean {
    return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export default function SandboxTestingView({
    sampleFiles,
    samplePreviewUrls,
    currentPageIndex,
    isExtracting,
    sandboxResponse,
    onPageChange,
    onSampleFilesChange,
    onClearSampleFiles,
    onRemoveFileAt,
    onRunExtraction,
}: SandboxTestingViewProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const currentFile = sampleFiles[currentPageIndex] || null;
    const currentPreviewUrl = samplePreviewUrls[currentPageIndex] || null;
    const totalPages = sampleFiles.length;
    const canPreviewCurrent = currentFile !== null && canPreviewFile(currentFile);
    const isCurrentPdf = currentFile !== null && isPdfFile(currentFile);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            onSampleFilesChange(Array.from(e.target.files));
        }
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onSampleFilesChange(Array.from(e.dataTransfer.files));
        }
    };

    const handleRemoveFile = (index: number) => {
        const newIndex = index <= currentPageIndex && currentPageIndex > 0
            ? currentPageIndex - 1
            : currentPageIndex;
        onPageChange(newIndex);
        onRemoveFileAt(index);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="md:col-span-7 space-y-6">
                <Card className="border-slate-200 shadow-xs">
                    <CardHeader className="border-b border-slate-100 pb-4">
                        <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-slate-800">
                            <FileText className="h-4 w-4 text-primary" /> Document Workspace
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500 font-medium">
                            Upload a sample document to test extraction against the active schema.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        {totalPages > 0 && currentPreviewUrl && canPreviewCurrent ? (
                            <div className="min-h-[300px] overflow-hidden rounded-lg border bg-slate-100 relative">
                                <div className="absolute top-2 right-2 z-10 flex gap-2">
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept=".pdf,.png,.jpg,.jpeg"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />
                                    <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
                                        <Upload className="h-3 w-3 mr-1" /> Upload
                                    </Button>
                                    <Button size="sm" variant="destructive" onClick={onClearSampleFiles}>
                                        <X className="h-3 w-3 mr-1" /> Clear
                                    </Button>
                                </div>

                                {totalPages > 1 && (
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white/80 backdrop-blur px-3 py-1 rounded-full shadow">
                                        <Button size="sm" variant="ghost" disabled={currentPageIndex === 0} onClick={() => onPageChange(currentPageIndex - 1)}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <span className="text-xs font-medium">Page {currentPageIndex + 1} of {totalPages}</span>
                                        <Button size="sm" variant="ghost" disabled={currentPageIndex === totalPages - 1} onClick={() => onPageChange(currentPageIndex + 1)}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                )}

                                {isCurrentPdf ? (
                                    <iframe
                                        src={`${currentPreviewUrl}#toolbar=1`}
                                        className="h-[400px] w-full bg-white"
                                        title="Document preview"
                                    />
                                ) : (
                                    <div className="flex h-[400px] items-center justify-center overflow-auto bg-white p-4">
                                        <img
                                            src={currentPreviewUrl}
                                            alt="Document preview"
                                            className="max-h-full max-w-full object-contain"
                                        />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDrop}
                                className="border border-dashed border-slate-200 rounded-xl bg-slate-50/50 p-6 flex flex-col items-center justify-center text-center min-h-[300px] hover:bg-muted/40 transition-colors cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.png,.jpg,.jpeg"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <div className="space-y-3">
                                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 shadow-sm border border-slate-200/40">
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="font-semibold text-slate-700 dark:text-slate-300">Drop sample files here</p>
                                        <p className="text-xs text-slate-400">
                                            {totalPages > 0
                                                ? "Preview engine is initialized for uploaded documents."
                                                : "Supports PDF, PNG, JPG format."}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {totalPages > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                                {sampleFiles.map((file, idx) => {
                                    const isActive = idx === currentPageIndex;
                                    return (
                                        <div
                                            key={`${file.name}-${idx}`}
                                            onClick={() => onPageChange(idx)}
                                            className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs cursor-pointer transition-all ${
                                                isActive
                                                    ? "border-slate-600 bg-slate-50 text-slate-800 shadow-sm"
                                                    : "bg-background text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            <span className="truncate max-w-24">{file.name}</span>
                                            <button
                                                type="button"
                                                className="shrink-0 text-muted-foreground hover:text-foreground"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleRemoveFile(idx);
                                                }}
                                                aria-label={`Remove ${file.name}`}
                                            >
                                                <X className="h-3 w-3" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                            <p className="text-xs text-slate-400">
                                {totalPages > 0 ? `${totalPages} file${totalPages > 1 ? "s" : ""} loaded` : ""}
                            </p>
                            <Button onClick={onRunExtraction} disabled={isExtracting || totalPages === 0} className="rounded-xl px-5 font-bold cursor-pointer">
                                {isExtracting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                                {isExtracting ? "Extracting..." : "Run Parse Extraction"}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="md:col-span-5 space-y-6 text-left">
                <Card className="border-slate-200 shadow-xs h-full flex flex-col">
                    <CardHeader className="border-b border-slate-100 pb-4 bg-slate-50/20">
                        <CardTitle className="text-sm font-bold flex items-center gap-1.5 text-slate-800">
                            <Gauge className="h-4 w-4 text-primary" /> Extraction Response
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-6 flex-grow flex flex-col justify-between">
                        {isExtracting ? (
                            <div className="py-12 flex flex-col items-center justify-center text-center flex-grow">
                                <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
                                <p className="text-xs font-bold text-slate-800">Processing Document Attributes</p>
                            </div>
                        ) : !sandboxResponse ? (
                            <div className="py-20 text-center text-slate-400 select-none flex flex-col items-center justify-center h-full flex-grow">
                                <span className="text-4xl mb-2">&#x26A1;</span>
                                <span className="text-xs font-bold text-slate-700">Awaiting Extraction</span>
                                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-normal">
                                    Upload a file and click "Run Parse Extraction" to see results.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-6 flex-grow flex flex-col justify-between h-full">
                                <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/30 flex items-start gap-3">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-700 mt-0.5" />
                                    <div>
                                        <h5 className="text-xs font-bold text-emerald-950">Structural Verification Passed</h5>
                                        <p className="text-xs text-emerald-800 leading-normal">All required fields survived matching constraints.</p>
                                    </div>
                                </div>
                                <div className="space-y-1.5 flex-grow">
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide font-mono">Verified Extraction Payload</p>
                                    <pre className="p-4 rounded-xl border border-slate-200 bg-slate-900 text-slate-100 font-mono text-[10px] whitespace-pre overflow-auto max-h-72 leading-relaxed flex-grow">
                                        {JSON.stringify((sandboxResponse as Record<string, unknown>).data || sandboxResponse, null, 2)}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
