import { ChevronLeft, ChevronRight, FileText, Maximize2, Minimize2, Upload, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SchemaPreviewCardProps {
    sampleFiles: File[];
    samplePreviewUrls: string[];
    currentPageIndex: number;
    maximized: boolean;
    onToggleMaximize: () => void;
    onSampleFilesChange: (files: File[]) => void;
    onClearSampleFiles: () => void;
    onPageChange: (index: number) => void;
    onRemoveFileAt: (index: number) => void;
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

export default function SchemaPreviewCard({
    sampleFiles,
    samplePreviewUrls,
    currentPageIndex,
    maximized,
    onToggleMaximize,
    onSampleFilesChange,
    onClearSampleFiles,
    onPageChange,
    onRemoveFileAt,
}: SchemaPreviewCardProps) {
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const totalPages = sampleFiles.length;
    const currentFile = sampleFiles[currentPageIndex];
    const currentPreviewUrl = samplePreviewUrls[currentPageIndex];
    const canPreviewCurrent = currentFile !== undefined && canPreviewFile(currentFile);
    const isCurrentPdf = currentFile !== undefined && isPdfFile(currentFile);

    const handleFilesSelected = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        onSampleFilesChange(Array.from(files));
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleClearAll = () => {
        onClearSampleFiles();
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
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
        <Card className="flex h-[calc(100vh-230px)] min-h-[680px] flex-col overflow-hidden">
            <CardHeader className="shrink-0 border-b">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Sample Preview</CardTitle>
                        <CardDescription>Review the uploaded document while editing schema fields.</CardDescription>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={onToggleMaximize}
                        aria-label={maximized ? "Minimize panel" : "Maximize panel"}
                    >
                        {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-4">
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
                        className="hidden"
                        onChange={(event) => handleFilesSelected(event.target.files)}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <Upload className="mr-2 h-4 w-4" />
                        Upload
                    </Button>
                    <span className="text-sm font-medium text-foreground">
                        {totalPages > 0 ? `${totalPages} file${totalPages > 1 ? "s" : ""}` : "No file"}
                    </span>
                </div>

                {totalPages > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5 pb-3">
                        {sampleFiles.map((file, index) => (
                            <div
                                key={`${file.name}-${index}`}
                                className={`flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${index === currentPageIndex
                                        ? "border-cyan-600 bg-cyan-50 text-cyan-800"
                                        : "bg-background text-muted-foreground"
                                    }`}
                            >
                                <span className="truncate max-w-24">{file.name}</span>
                                <button
                                    type="button"
                                    className="shrink-0 text-muted-foreground hover:text-foreground"
                                    onClick={() => handleRemoveFile(index)}
                                    aria-label={`Remove ${file.name}`}
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            className="text-xs text-muted-foreground underline hover:text-foreground"
                            onClick={handleClearAll}
                        >
                            Clear all
                        </button>
                    </div>
                ) : null}

                {totalPages > 1 ? (
                    <div className="flex items-center justify-center gap-4 pb-3 text-sm text-muted-foreground">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={currentPageIndex === 0}
                            onClick={() => onPageChange(currentPageIndex - 1)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                            Prev
                        </Button>
                        <span className="font-medium tabular-nums">
                            Page {currentPageIndex + 1} of {totalPages}
                        </span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={currentPageIndex === totalPages - 1}
                            onClick={() => onPageChange(currentPageIndex + 1)}
                        >
                            Next
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                ) : null}

                {currentFile && currentPreviewUrl && canPreviewCurrent ? (
                    <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-slate-100">
                        {isCurrentPdf ? (
                            <iframe
                                title="Document PDF preview"
                                src={`${currentPreviewUrl}#toolbar=1`}
                                className="h-full min-h-140 w-full bg-white"
                            />
                        ) : (
                            <div className="flex h-full min-h-140 items-center justify-center overflow-auto bg-white p-4">
                                <img
                                    src={currentPreviewUrl}
                                    alt="Document sample preview"
                                    className="max-h-full max-w-full object-contain"
                                />
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed bg-slate-50 p-6 text-center text-sm text-muted-foreground">
                        <div className="space-y-2">
                            <FileText className="mx-auto h-7 w-7" />
                            <p>
                                {totalPages > 0
                                    ? "Preview is available for PDF and image sample files."
                                    : "Upload PDF or image files to preview document pages."}
                            </p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
