"use client";

import { Check, Eye, Loader2, Lock, Trash2, Upload } from "lucide-react";
import type { RequiredDocument } from "@/types/student";
import type { SlotStatusResponse } from "@/types/requirement";
import type { SubmissionDetail } from "@/types/submission";
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { currentFileFor, LOCKED_SUBMISSION_STATUSES, verifiedDocumentTypeIds } from "./utils";

interface ManualUploadSlotsProps {
  slots: SlotStatusResponse[];
  legacyDocuments: RequiredDocument[];
  existingSubmissions: SubmissionDetail[];
  uploadingTypeIds: Set<string>;
  onChooseFile: (documentTypeId: string, file: File) => void;
  onView: (submissionId: string) => void;
  onDelete: (submission: SubmissionDetail) => void;
}

interface DocumentRow {
  documentTypeId: string;
  name: string;
}

interface SlotGroup {
  key: string;
  // Solo documents have no heading: the row itself names the document.
  solo: boolean;
  title: string;
  hint: string | null;
  rows: DocumentRow[];
}

const ACCEPTED_TYPES = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

/** Groups the required documents the way the admin set them up: solo documents and alternative groups. */
function buildGroups(slots: SlotStatusResponse[], legacy: RequiredDocument[]): SlotGroup[] {
  if (slots.length === 0) {
    return legacy.map((doc) => ({
      key: doc.id,
      solo: true,
      title: doc.name,
      hint: null,
      rows: [{ documentTypeId: doc.id, name: doc.name }],
    }));
  }
  return slots.map((slot) => {
    const rows = slot.items.map((item) => ({
      documentTypeId: item.document_type_id,
      name: item.document_type_name,
    }));
    if (slot.slot_type === "group") {
      return {
        key: slot.id,
        solo: false,
        title: slot.group_name ?? slot.description ?? "Choose one of these",
        hint: `Upload at least ${slot.min_required} of the documents below.`,
        rows,
      };
    }
    return { key: slot.id, solo: true, title: rows[0]?.name ?? "Document", hint: null, rows };
  });
}

const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-primary";

export default function ManualUploadSlots({
  slots,
  legacyDocuments,
  existingSubmissions,
  uploadingTypeIds,
  onChooseFile,
  onView,
  onDelete,
}: ManualUploadSlotsProps) {
  const groups = buildGroups(slots, legacyDocuments);
  // Computed once per render, not once per row.
  const verifiedIds = useMemo(() => verifiedDocumentTypeIds(existingSubmissions), [existingSubmissions]);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
        <p className="text-sm font-medium text-slate-900">No documents are required yet</p>
        <p className="mt-1 text-sm text-slate-600">Your adviser has not set up the required documents for this school year.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key} className="rounded-xl border border-slate-200 bg-white p-4">
          {!group.solo && (
            <header className="mb-3">
              <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
              {group.hint && <p className="mt-0.5 text-xs text-slate-500">{group.hint}</p>}
            </header>
          )}
          <ul className="divide-y divide-slate-100">
            {group.rows.map((row) => {
              const verified = verifiedIds.has(row.documentTypeId);
              const current = currentFileFor(row.documentTypeId, existingSubmissions);
              const locked = current !== undefined && LOCKED_SUBMISSION_STATUSES.has(current.status);
              const uploading = uploadingTypeIds.has(row.documentTypeId);
              // Changes when a file is added, replaced or removed, so the status line animates.
              const stateKey = verified
                ? "verified"
                : locked
                  ? `locked-${current?.id}`
                  : current
                    ? `file-${current.id}`
                    : "empty";

              return (
                <li key={row.documentTypeId} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                  {/* Names wrap onto several lines on phones instead of being cut off. */}
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium text-slate-900">{row.name}</p>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={stateKey}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="mt-0.5 break-all text-xs text-slate-500"
                      >
                        {verified && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Lock className="h-3 w-3" aria-hidden="true" /> Verified by your adviser
                          </span>
                        )}
                        {!verified && locked && (
                          <span className="inline-flex items-center gap-1">
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            {current?.status === "processing" ? "Being processed: " : "Submitted: "}
                            {current?.original_filename}
                          </span>
                        )}
                        {!verified && !locked && current && <>File: {current.original_filename}</>}
                        {!verified && !locked && !current && "No file yet"}
                      </motion.p>
                    </AnimatePresence>
                  </div>

                  <div className="flex items-center gap-1">
                    {!verified && current && !current.filled_online && (
                      <button
                        type="button"
                        onClick={() => onView(current.id)}
                        aria-label={`View ${current.original_filename}`}
                        className={iconButtonClass}
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                    {!verified && current && !locked && (
                      <button
                        type="button"
                        onClick={() => onDelete(current)}
                        aria-label={`Delete ${current.original_filename}`}
                        className={iconButtonClass}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  {verified ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      <Check className="h-3.5 w-3.5" aria-hidden="true" /> Done
                    </span>
                  ) : locked ? null : uploading ? (
                    <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> Uploading…
                    </span>
                  ) : (
                    // One control per document: the label wraps the hidden file input, so the
                    // input's accessible name is the visible label text and it is announced once.
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-within:outline-2 focus-within:outline-primary">
                      <input
                        id={`choose-file-${row.documentTypeId}`}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        className="sr-only"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = "";
                          if (file) onChooseFile(row.documentTypeId, file);
                        }}
                      />
                      <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                      {current ? "Replace file" : "Choose file"}
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
