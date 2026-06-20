import { motion } from "framer-motion";
import { Sparkles, Tag, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { DocumentTypeFormState, StudentClassification } from "@/types/documentType";

const CLASSIFICATION_OPTIONS: { value: StudentClassification; label: string }[] = [
    { value: "freshman", label: "Freshmen" },
    { value: "transferee", label: "Transferees" },
    { value: "shifter", label: "Shifters" },
    { value: "returning", label: "Returning / Continuing" },
    { value: "cross_enrollee", label: "Cross-Enrolees" },
];

interface DocumentTypeFormProps {
    open: boolean;
    mode: "create" | "edit";
    formState: DocumentTypeFormState;
    keywordInput: string;
    error: string;
    onOpenChange: (open: boolean) => void;
    onFormStateChange: (next: DocumentTypeFormState) => void;
    onKeywordInputChange: (value: string) => void;
    onKeywordAdd: (rawKeyword: string) => void;
    onKeywordRemove: (keyword: string) => void;
    onSubmit: () => void;
}

export default function DocumentTypeForm({
    open,
    mode,
    formState,
    keywordInput,
    error,
    onOpenChange,
    onFormStateChange,
    onKeywordInputChange,
    onKeywordAdd,
    onKeywordRemove,
    onSubmit,
}: DocumentTypeFormProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{mode === "edit" ? "Edit Document Type" : "Add Document Type"}</DialogTitle>
                    <DialogDescription>
                        Configure general details now and keep classification settings for classifying document types.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <motion.section
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-4 rounded-lg border bg-muted/20 p-4"
                    >
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">General Information</h3>
                                <p className="text-xs text-muted-foreground">Core document settings for enrollment workflows.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <Label htmlFor="document-type-active" className="text-xs text-muted-foreground">Active</Label>
                                <Switch
                                    id="document-type-active"
                                    checked={formState.isActive}
                                    onCheckedChange={(checked) =>
                                        onFormStateChange({ ...formState, isActive: checked })
                                    }
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="document-type-name">Document Name</Label>
                                <Input
                                    id="document-type-name"
                                    placeholder="e.g., Report Card"
                                    value={formState.name}
                                    onChange={(event) =>
                                        onFormStateChange({ ...formState, name: event.target.value })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="document-type-code">Code</Label>
                                <Input
                                    id="document-type-code"
                                    placeholder="e.g., REPORT_CARD"
                                    value={formState.code}
                                    onChange={(event) =>
                                        onFormStateChange({
                                            ...formState,
                                            code: event.target.value.toUpperCase(),
                                        })
                                    }
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="document-type-description">Description</Label>
                            <Textarea
                                id="document-type-description"
                                placeholder="Describe what this document is and why it is required."
                                value={formState.description}
                                onChange={(event) =>
                                    onFormStateChange({ ...formState, description: event.target.value })
                                }
                            />
                        </div>
                    </motion.section>

                    <motion.section
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: 0.05 }}
                        className="space-y-4 rounded-lg border bg-muted/20 p-4"
                    >
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-cyan-700" />
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">Classification Settings</h3>
                                <p className="text-xs text-muted-foreground">Settings for classifying document types.</p>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="document-type-classifier-description">Classifier Description</Label>
                            <Textarea
                                id="document-type-classifier-description"
                                placeholder="Describe visual/text clues that make this document recognizable."
                                value={formState.classifierDescription}
                                onChange={(event) =>
                                    onFormStateChange({
                                        ...formState,
                                        classifierDescription: event.target.value,
                                    })
                                }
                            />
                            <p className="text-xs text-muted-foreground">
                                This helps describe how the document can be recognized later by LlamaClassify.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="document-type-keywords">Keywords</Label>
                            <div className="rounded-lg border bg-background p-2">
                                {formState.keywords.length > 0 ? (
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        {formState.keywords.map((keyword) => (
                                            <Badge key={keyword} variant="secondary" className="h-7 gap-1">
                                                <span>{keyword}</span>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center rounded-sm hover:text-foreground"
                                                    onClick={() => onKeywordRemove(keyword)}
                                                    aria-label={`Remove ${keyword}`}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="flex gap-2">
                                    <Input
                                        id="document-type-keywords"
                                        value={keywordInput}
                                        onChange={(event) => onKeywordInputChange(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === ",") {
                                                event.preventDefault();
                                                onKeywordAdd(keywordInput);
                                            }
                                        }}
                                        onBlur={() => onKeywordAdd(keywordInput)}
                                        placeholder="Type a keyword then press Enter"
                                    />
                                    <Button type="button" variant="outline" onClick={() => onKeywordAdd(keywordInput)}>
                                        <Tag className="mr-2 h-4 w-4" />
                                        Add
                                    </Button>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Keywords are optional repeated words, labels, or clues commonly found in this document.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Applies To</Label>
                            <div className="flex flex-wrap gap-2">
                                {CLASSIFICATION_OPTIONS.map((option) => {
                                    const isSelected = formState.applicableClassifications.includes(option.value);
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm transition-colors ${
                                                isSelected
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-input bg-background hover:bg-accent"
                                            }`}
                                            onClick={() => {
                                                const next = isSelected
                                                    ? formState.applicableClassifications.filter((c) => c !== option.value)
                                                    : [...formState.applicableClassifications, option.value];
                                                onFormStateChange({ ...formState, applicableClassifications: next });
                                            }}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            {formState.applicableClassifications.length === 0 && (
                                <p className="text-xs text-amber-600">
                                    Warning: This document will not appear in any checklist if no classification is selected.
                                </p>
                            )}
                        </div>
                    </motion.section>

                    {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={onSubmit}>
                        {mode === "edit" ? "Save Changes" : "Create Document Type"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
