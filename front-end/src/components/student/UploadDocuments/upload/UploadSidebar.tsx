"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, ChevronDown, ChevronRight, Circle, Download, FileText, Lightbulb, Pencil } from "lucide-react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import type { SlotItemStatus, SlotStatusResponse } from "@/types/requirement";
import { getSlotDisplayName } from "@/types/requirement";

interface UploadSidebarProps {
    slots?: SlotStatusResponse[];
    legacyDocuments?: { id: string; name: string; code: string; is_required: boolean }[];
}

const DESKTOP_QUERY = "(min-width: 1024px)";

// True on desktop widths. Without matchMedia (tests, server render) it reports desktop,
// so the whole checklist is visible.
function useIsDesktop(): boolean {
    const canMatch = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
    const [isDesktop, setIsDesktop] = useState(() => (canMatch() ? window.matchMedia(DESKTOP_QUERY).matches : true));

    useEffect(() => {
        if (!canMatch()) return;
        const media = window.matchMedia(DESKTOP_QUERY);
        const onChange = () => setIsDesktop(media.matches);
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    return isDesktop;
}

export default function UploadSidebar({ slots, legacyDocuments }: UploadSidebarProps) {
    const [expanded, setExpanded] = useState(false);
    const isDesktop = useIsDesktop();
    const hasSlots = slots && slots.length > 0;
    const showLegacy = !hasSlots && legacyDocuments && legacyDocuments.length > 0;

    const total = hasSlots ? slots.length : showLegacy ? legacyDocuments.length : 0;
    const done = hasSlots ? slots.filter((slot) => slot.is_complete).length : 0;
    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const summary = `${done} of ${total} done`;
    // Legacy lists have no summary toggle, so they always show.
    const showList = isDesktop || !hasSlots || expanded;

    return (
        <div className="col-span-12 lg:col-span-4 space-y-4">
            {(hasSlots || showLegacy) && (
                <section
                    aria-labelledby="required-documents-title"
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                    <div className="flex items-center justify-between gap-3">
                        <h4 id="required-documents-title" className="text-sm font-semibold text-slate-900">
                            Required documents
                        </h4>
                        {/* Phones: the checklist starts collapsed, so the summary is the control. Desktop always shows it. */}
                        {hasSlots && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => setExpanded((open) => !open)}
                                    aria-expanded={expanded}
                                    aria-controls={showList ? "required-documents-list" : undefined}
                                    className="inline-flex items-center gap-1 rounded-md text-xs text-slate-500 tabular-nums focus-visible:outline-2 focus-visible:outline-primary lg:hidden"
                                >
                                    {summary}
                                    <ChevronDown
                                        className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
                                        aria-hidden="true"
                                    />
                                </button>
                                <p className="hidden text-xs text-slate-500 tabular-nums lg:block">{summary}</p>
                            </>
                        )}
                    </div>

                    <AnimatePresence initial={false}>
                    {showList && (
                    <motion.div
                        key="required-documents-list"
                        id="required-documents-list"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="overflow-hidden"
                    >
                        {hasSlots && (
                            <div
                                role="progressbar"
                                aria-label="Required documents done"
                                aria-valuemin={0}
                                aria-valuemax={total}
                                aria-valuenow={done}
                                className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
                            >
                                <div
                                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                        )}

                        <ul className="mt-4 divide-y divide-slate-100">
                            {hasSlots &&
                                slots.map((slot) => <SlotRow key={slot.id} slot={slot} />)}
                            {showLegacy &&
                                legacyDocuments.map((doc) => (
                                    <li key={doc.id} className="flex items-center gap-3 py-3">
                                        <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                                        <span className="text-sm text-slate-900">{doc.name}</span>
                                    </li>
                                ))}
                        </ul>
                    </motion.div>
                    )}
                    </AnimatePresence>
                </section>
            )}

            <div className="bg-emerald-50/50 rounded-2xl p-5 border border-emerald-200">
                <div className="flex items-center gap-2 mb-3">
                    <Lightbulb className="h-5 w-5 text-primary" />
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-primary">Upload Tips</h4>
                </div>
                <ul className="space-y-3">
                    {[
                        "Ensure documents are well-lit and all four corners are visible.",
                        "High-resolution scans lead to faster verification times.",
                        "Avoid glare on laminated surfaces when using photography.",
                    ].map((tip) => (
                        <li key={tip} className="flex gap-3">
                            <CheckCircle className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-slate-600">{tip}</p>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="relative z-10">
                    <h4 className="text-base font-semibold text-slate-900 mb-2">Academic Trust</h4>
                    <p className="text-sm text-slate-500 mb-4">
                        Our systems utilize encryption to ensure your personal data remains secure
                        throughout the verification process.
                    </p>
                    <a
                        href="/privacy-policy"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-primary flex items-center gap-1 hover:gap-2 transition-all"
                    >
                        View Privacy Policy
                        <ChevronRight className="h-3.5 w-3.5" />
                    </a>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12">
                    <FileText className="h-28 w-28 text-primary" />
                </div>
            </div>
        </div>
    );
}

/** One required slot: a document, or a group where any of the listed documents will do. */
function SlotRow({ slot }: { slot: SlotStatusResponse }) {
    const name = getSlotDisplayName(slot);
    const isGroup = slot.slot_type === "group";
    const done = slot.is_complete;
    // Inside a group every alternative is listed; a solo document only shows its blank form links.
    const formItems = isGroup ? slot.items : slot.items.filter((item) => item.form_id && item.item_id);

    return (
        <li className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-center gap-3">
                <StatusIcon done={done} />
                <span className={cn("flex-1 text-sm", done ? "text-slate-500" : "font-medium text-slate-900")}>
                    {name}
                </span>
                <span className={cn("shrink-0 text-xs tabular-nums", done ? "text-primary" : "text-slate-500")}>
                    {done
                        ? "Done"
                        : isGroup
                            ? `${slot.matched_count} of ${slot.min_required}`
                            : "Missing"}
                </span>
            </div>

            {isGroup && done && (
                <p className="mt-1.5 pl-7 text-[11px] text-primary">
                    Requirement fulfilled: new uploads add alternate copies.
                </p>
            )}

            {isGroup && !done && (
                <p className="mt-1.5 pl-7 text-xs text-slate-500">
                    Upload any {slot.min_required} of these:
                </p>
            )}

            {formItems.length > 0 && (
                <div className={cn("mt-1.5", isGroup ? "space-y-3 pl-7" : "pl-7")}>
                    {formItems.map((item) => (
                        <FormLinks key={item.item_id} item={item} showName={isGroup} allowFill={!done} />
                    ))}
                </div>
            )}
        </li>
    );
}

// Decorative: the row's text already says "Done" or "Missing", so the icon is hidden from screen readers.
function StatusIcon({ done }: { done: boolean }) {
    return done ? (
        <CheckCircle className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
    ) : (
        <Circle className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
    );
}

/** Form actions for one document. The row above already names the document, so the names are
 *  only shown inside a group, where several alternatives are listed together. */
function FormLinks({ item, showName, allowFill }: { item: SlotItemStatus; showName: boolean; allowFill: boolean }) {
    const label = item.document_type_name;
    const hasForms = Boolean(item.form_id && item.item_id);
    // Documents without a blank form still need their name shown inside a group.
    if (!hasForms && !showName) return null;
    const linkClass =
        "inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded";

    return (
        <div>
            {showName && <p className="text-xs font-medium text-slate-700">{label}</p>}
            {hasForms && (
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {allowFill && (
                        <Link
                            to={`/student/fill-form/${item.item_id}`}
                            aria-label={`Fill online: ${label}`}
                            className={linkClass}
                        >
                            <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Fill online
                        </Link>
                    )}
                    <Link
                        to={`/student/blank-form/${item.item_id}`}
                        aria-label={`Download blank form: ${label}`}
                        className={linkClass}
                    >
                        <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        Download blank form
                    </Link>
                </div>
            )}
        </div>
    );
}
