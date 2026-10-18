"use client";

import { useAuth } from "@clerk/clerk-react";
import { Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { fetchWithClerkAuth } from "@/lib/api";
import { createEmptyStructuredDocument } from "@/lib/formLayout";
import type { FormDocument, FormGenerateResponse, FormRecord } from "@/types/form";

interface CreateFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: (form: FormRecord) => void;
}

export default function CreateFormModal({ open, onOpenChange, onCreated }: CreateFormModalProps) {
    const { getToken } = useAuth();

    const [name, setName] = useState("");
    const [mode, setMode] = useState<"blank" | "ai">("blank");
    const [description, setDescription] = useState("");
    const [isCreating, setIsCreating] = useState(false);

    const request = async (path: string, init?: RequestInit): Promise<Response> => {
        const token = await getToken();
        if (!token) throw new Error("Missing admin authentication token.");
        return fetchWithClerkAuth(path, token, init);
    };

    const reset = () => {
        setName("");
        setMode("blank");
        setDescription("");
    };

    const handleSubmit = async () => {
        if (!name.trim()) {
            toast.error("Please enter a form name.");
            return;
        }
        setIsCreating(true);
        try {
            let document: FormDocument = createEmptyStructuredDocument();
            if (mode === "ai") {
                const genRes = await request("/api/admin/forms/generate", {
                    method: "POST",
                    body: JSON.stringify({ description }),
                });
                if (!genRes.ok) {
                    throw new Error(`Generation failed with status ${genRes.status}.`);
                }
                const gen = (await genRes.json()) as FormGenerateResponse;
                document = gen.document_json;
            }

            const createRes = await request("/api/admin/forms", {
                method: "POST",
                body: JSON.stringify({ name: name.trim(), description: description.trim() || null, document_json: document }),
            });
            if (!createRes.ok) {
                const detail = await createRes.json().catch(() => null);
                throw new Error(`Create failed with status ${createRes.status}.${detail ? ` ${(detail as { detail?: string }).detail ?? ""}` : ""}`);
            }
            const form = (await createRes.json()) as FormRecord;
            toast.success("Form created.");
            onCreated(form);
            onOpenChange(false);
            reset();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to create form.");
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Create form</DialogTitle>
                    <DialogDescription>Start blank or generate a form structure with AI.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="create-form-name">Form name</Label>
                        <Input id="create-form-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Admission Form 2026-2027" />
                    </div>

                    <div className="flex gap-2">
                        <ModeButton active={mode === "blank"} onClick={() => setMode("blank")} label="Blank" />
                        <ModeButton active={mode === "ai"} onClick={() => setMode("ai")} label="Generate with AI" />
                    </div>

                    {mode === "ai" && (
                        <div className="space-y-1.5">
                            <Label htmlFor="create-form-description">Describe the form and its fields</Label>
                            <Textarea
                                id="create-form-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Create a form with these fields: student name, LRN, date of birth, sex, grade level, SHS track"
                                className="min-h-24"
                            />
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={isCreating || !name.trim()} className="gap-2">
                        {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {isCreating ? "Creating…" : "Create form"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <Button type="button" variant={active ? "default" : "outline"} size="sm" onClick={onClick} className="flex-1">
            {label}
        </Button>
    );
}
