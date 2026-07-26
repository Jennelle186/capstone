import { motion } from "framer-motion";
import { Loader2, RefreshCw, Sparkles, Tag, X } from "lucide-react";
import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { GeneratedClassificationResult } from "@/types/documentType";

interface AIGenerateModalProps {
    open: boolean;
    isLoading: boolean;
    result: GeneratedClassificationResult | null;
    onOpenChange: (open: boolean) => void;
    onTryAgain: () => void;
    onApply: (classifierDescription: string, keywords: string[]) => void;
}

export default function AIGenerateModal({
    open,
    isLoading,
    result,
    onOpenChange,
    onTryAgain,
    onApply,
}: AIGenerateModalProps) {
    const [editedDescription, setEditedDescription] = useState("");
    const [editedKeywords, setEditedKeywords] = useState<string[]>([]);
    const [newKeyword, setNewKeyword] = useState("");
    const [hasLoaded, setHasLoaded] = useState(false);

    if (result && !hasLoaded) {
        setEditedDescription(result.classifier_description);
        setEditedKeywords([...result.keywords]);
        setHasLoaded(true);
    }

    if (!open && hasLoaded) {
        return null;
    }

    if (!open) return null;

    const handleOpenChange = (nextOpen: boolean) => {
        if (!nextOpen) {
            setHasLoaded(false);
        }
        onOpenChange(nextOpen);
    };

    const handleApply = () => {
        onApply(editedDescription, editedKeywords);
        setHasLoaded(false);
    };

    const handleAddKeyword = () => {
        const trimmed = newKeyword.trim();
        if (!trimmed) return;
        if (editedKeywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
            setNewKeyword("");
            return;
        }
        setEditedKeywords((prev) => [...prev, trimmed]);
        setNewKeyword("");
    };

    const handleRemoveKeyword = (keyword: string) => {
        setEditedKeywords((prev) => prev.filter((k) => k !== keyword));
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-cyan-600" />
                        AI-Generated Classification
                    </DialogTitle>
                    <DialogDescription>
                        Review and tweak the suggestions before applying them to your document type.
                    </DialogDescription>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-12">
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        >
                            <Loader2 className="h-8 w-8 text-cyan-600" />
                        </motion.div>
                        <p className="text-sm text-muted-foreground">
                            Analyzing document type and generating suggestions...
                        </p>
                    </div>
                ) : result ? (
                    <div className="space-y-5 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="ai-classifier-description">Classifier Description</Label>
                            <Textarea
                                id="ai-classifier-description"
                                className="min-h-[100px]"
                                value={editedDescription}
                                onChange={(e) => setEditedDescription(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                Visual and textual clues that help identify this document.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Keywords</Label>
                            <div className="rounded-lg border bg-background p-2">
                                {editedKeywords.length > 0 ? (
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        {editedKeywords.map((keyword) => (
                                            <Badge key={keyword} variant="secondary" className="h-7 gap-1">
                                                <span>{keyword}</span>
                                                <button
                                                    type="button"
                                                    className="inline-flex items-center rounded-sm hover:text-foreground"
                                                    onClick={() => handleRemoveKeyword(keyword)}
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
                                        value={newKeyword}
                                        onChange={(e) => setNewKeyword(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === ",") {
                                                e.preventDefault();
                                                handleAddKeyword();
                                            }
                                        }}
                                        onBlur={() => handleAddKeyword()}
                                        placeholder="Type a keyword then press Enter"
                                    />
                                    <Button type="button" variant="outline" onClick={handleAddKeyword}>
                                        <Tag className="mr-2 h-4 w-4" />
                                        Add
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {result.reasoning ? (
                            <div className="rounded-lg border bg-muted/30 p-3">
                                <p className="text-xs font-medium text-muted-foreground">Why these were chosen</p>
                                <p className="mt-1 text-xs text-muted-foreground">{result.reasoning}</p>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="outline"
                        onClick={onTryAgain}
                        disabled={isLoading}
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Try Again
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={isLoading || !result}
                    >
                        Use These
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
