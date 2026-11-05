import { describe, expect, it } from "vitest";
import type { SubmissionDetail } from "@/types/submission";
import {
  currentFileFor,
  errorDetailText,
  previousFilesFor,
  verifiedDocumentTypeIds,
  withCompiledSegments,
  LOCKED_SUBMISSION_STATUSES,
} from "@/components/student/UploadDocuments/upload/utils";

function sub(id: string, documentTypeId: string, status: string, extra: Partial<SubmissionDetail> = {}) {
  return { id, document_type_id: documentTypeId, status, parent_submission_id: null, ...extra } as unknown as SubmissionDetail;
}

describe("previousFilesFor", () => {
  it("returns every replaceable copy of the type, including flagged and extra files", () => {
    const submissions = [
      sub("a", "dt-1", "flagged"),
      sub("b", "dt-1", "uploaded"),
      sub("c", "dt-2", "uploaded"),
    ];

    expect(previousFilesFor("dt-1", submissions).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("leaves out verified and locked files, but includes a compiled segment of the same type", () => {
    const submissions = [
      sub("verified", "dt-1", "verified"),
      sub("locked", "dt-1", "submitted"),
      sub("in-review", "dt-1", "in-review"),
      sub("segment", "dt-1", "uploaded", { parent_submission_id: "parent" }),
      sub("ok", "dt-1", "classified"),
    ];

    expect(previousFilesFor("dt-1", submissions).map((s) => s.id)).toEqual(["segment", "ok"]);
  });
});

describe("withCompiledSegments", () => {
  it("lists each segment right after its parent, so a segment is found like any other file", () => {
    const parent = sub("parent", "", "classified", {
      children: [sub("seg-1", "dt-1", "classified"), sub("seg-2", "dt-2", "uploaded")],
    } as Partial<SubmissionDetail>);
    const other = sub("other", "dt-3", "uploaded");

    expect(withCompiledSegments([parent, other]).map((s) => s.id)).toEqual(["parent", "seg-1", "seg-2", "other"]);
  });
});

describe("verifiedDocumentTypeIds", () => {
  it("collects the types with a verified file, once each", () => {
    const submissions = [
      sub("a", "dt-1", "verified"),
      sub("b", "dt-1", "verified"),
      sub("c", "dt-2", "uploaded"),
    ];

    expect([...verifiedDocumentTypeIds(submissions)]).toEqual(["dt-1"]);
  });
});

describe("currentFileFor", () => {
  it("ignores a PENDING row, so a failed upload does not hide the file the student already has", () => {
    const submissions = [sub("orphan", "dt-1", "pending"), sub("real", "dt-1", "uploaded")];

    expect(currentFileFor("dt-1", submissions)?.id).toBe("real");
  });

  it("returns nothing when the only row is PENDING", () => {
    expect(currentFileFor("dt-1", [sub("orphan", "dt-1", "pending")])).toBeUndefined();
  });

  it("finds a compiled segment that holds the document type, so the card does not read 'No file yet'", () => {
    const segment = sub("segment", "dt-1", "classified", { parent_submission_id: "parent" });

    expect(currentFileFor("dt-1", [segment])?.id).toBe("segment");
  });

  it("shows a file the adviser has received in preference to a newer copy", () => {
    const submissions = [sub("new", "dt-1", "uploaded"), sub("received", "dt-1", "submitted")];

    expect(currentFileFor("dt-1", submissions)?.id).toBe("received");
  });
});

describe("LOCKED_SUBMISSION_STATUSES", () => {
  it("matches the backend delete lock, including files being processed or extracted", () => {
    for (const status of ["submitted", "in-review", "processing"]) {
      expect(LOCKED_SUBMISSION_STATUSES.has(status)).toBe(true);
    }
    expect(LOCKED_SUBMISSION_STATUSES.has("uploaded")).toBe(false);
  });
});

describe("errorDetailText", () => {
  it("returns a string detail as it is", () => {
    expect(errorDetailText("This document is not required for your school year.")).toBe(
      "This document is not required for your school year.",
    );
  });

  it("returns null for a validation list, so the caller shows its own message", () => {
    expect(errorDetailText([{ loc: ["body", "name"], msg: "field required" }])).toBeNull();
  });

  it("returns null for an empty or missing detail", () => {
    expect(errorDetailText("   ")).toBeNull();
    expect(errorDetailText(undefined)).toBeNull();
  });
});
