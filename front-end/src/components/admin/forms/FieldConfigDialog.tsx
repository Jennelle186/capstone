"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { FieldNodeAttrs, FieldOption, FormFieldUiComponent } from "@/types/form";

const FIELD_COMPONENT_LABELS: Record<FormFieldUiComponent, string> = {
    text_input: "Text input",
    radio_group: "Radio group",
    checkbox_group: "Checkbox group",
    dropdown: "Dropdown",
    date_picker: "Date picker",
};

const CHOICE_TYPES: FormFieldUiComponent[] = ["radio_group", "checkbox_group", "dropdown"];

export type FieldConfigSubmit = Omit<FieldNodeAttrs, "field_key">;

interface FieldConfigDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initial?: FieldNodeAttrs | null;
    onSubmit: (attrs: FieldConfigSubmit) => void;
}

export default function FieldConfigDialog({ open, onOpenChange, initial = null, onSubmit }: FieldConfigDialogProps) {
    const [label, setLabel] = useState("");
    const [uiComponent, setUiComponent] = useState<FormFieldUiComponent>("text_input");
    const [required, setRequired] = useState(false);
    const [options, setOptions] = useState<FieldOption[]>([]);

    useEffect(() => {
        if (!open) return;
        setLabel(initial?.label ?? "");
        setUiComponent(initial?.ui_component ?? "text_input");
        setRequired(initial?.required ?? false);
        setOptions(initial?.options ? [...initial.options] : []);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const addOption = () => setOptions((prev) => [...prev, { value: "", label: "" }]);
    const removeOption = (index: number) => setOptions((prev) => prev.filter((_, i) => i !== index));
    const updateOption = (index: number, patch: Partial<FieldOption>) =>
        setOptions((prev) => prev.map((o, i) => (i === index ? { ...o, ...patch } : o)));

    const handleSubmit = () => {
        if (!label.trim()) return;
        const isChoice = CHOICE_TYPES.includes(uiComponent);
        const cleanOptions = isChoice
            ? options
                  .filter((o) => o.value.trim() || o.label.trim())
                  .map((o) => ({ value: o.value.trim(), label: o.label.trim() || o.value.trim() }))
            : null;
        onSubmit({ label: label.trim(), ui_component: uiComponent, required, options: cleanOptions });
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{initial ? "Edit field" : "Add field"}</DialogTitle>
                    <DialogDescription>Configure this form field. It maps to an extraction field.</DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="field-label">Label</Label>
                        <Input id="field-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Student Name" />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Field type</Label>
                        <Select value={uiComponent} onValueChange={(v) => setUiComponent(v as FormFieldUiComponent)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {(Object.keys(FIELD_COMPONENT_LABELS) as FormFieldUiComponent[]).map((key) => (
                                    <SelectItem key={key} value={key}>
                                        {FIELD_COMPONENT_LABELS[key]}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {CHOICE_TYPES.includes(uiComponent) && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Options</Label>
                                <Button type="button" variant="outline" size="sm" className="h-7 gap-1" onClick={addOption}>
                                    <Plus className="h-3.5 w-3.5" />
                                    Add
                                </Button>
                            </div>
                            {options.length === 0 && <p className="text-xs text-slate-400">No options yet.</p>}
                            <div className="space-y-2">
                                {options.map((opt, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <Input
                                            value={opt.value}
                                            onChange={(e) => updateOption(i, { value: e.target.value })}
                                            placeholder="value"
                                            className="h-8"
                                        />
                                        <Input
                                            value={opt.label}
                                            onChange={(e) => updateOption(i, { label: e.target.value })}
                                            placeholder="label"
                                            className="h-8"
                                        />
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 shrink-0 text-slate-400 hover:text-red-600"
                                            onClick={() => removeOption(i)}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between">
                        <Label htmlFor="field-required">Required</Label>
                        <Switch id="field-required" checked={required} onCheckedChange={setRequired} />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!label.trim()}>
                        {initial ? "Save field" : "Add field"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
