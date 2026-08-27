import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export default function InsertZone({
    afterFieldId,
    onAddField,
    onAddSection,
}: {
    afterFieldId?: string;
    onAddField: (afterFieldId?: string) => void;
    onAddSection: (afterFieldId?: string) => void;
}) {
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            className="relative flex items-center justify-center"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div className="h-2 w-full" />
            {isHovered && (
                <div className="absolute inset-x-0 -top-1 z-10 flex items-center justify-center gap-1">
                    <div className="h-px flex-1 bg-slate-200" />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                        onClick={() => onAddField(afterFieldId)}
                    >
                        <Plus className="h-3 w-3" />
                        Add Field
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                        onClick={() => onAddSection(afterFieldId)}
                    >
                        <Plus className="h-3 w-3" />
                        Add Section
                    </Button>
                    <div className="h-px flex-1 bg-slate-200" />
                </div>
            )}
        </div>
    );
}
