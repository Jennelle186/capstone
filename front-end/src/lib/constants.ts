import type { ClassificationStatus } from "@/types/classification";

export const CLASSIFICATION_COMPLETE_STATUSES: ReadonlySet<ClassificationStatus> = new Set([
  "classified",
  "needs-review",
  "overridden",
  "submitted",
]);

export function isClassificationComplete(
  items: { status: ClassificationStatus }[],
): boolean {
  if (items.length === 0) return false;
  return items.every((i) => CLASSIFICATION_COMPLETE_STATUSES.has(i.status));
}
