/**
 * Turns a FastAPI error body into a readable message.
 * `detail` is a string for HTTPException, and a list of { msg } objects for 422 validation errors.
 */
export function messageFromErrorDetail(detail: unknown, fallback: string): string {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        item && typeof item === "object" && typeof (item as { msg?: unknown }).msg === "string"
          ? (item as { msg: string }).msg
          : null,
      )
      .filter((msg): msg is string => Boolean(msg));
    if (messages.length > 0) return messages.join(" ");
  }
  return fallback;
}

/** Reads the error message from a failed fetch response, falling back to the status code. */
export async function readApiErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed with status ${response.status}.`;
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    return messageFromErrorDetail(payload.detail, fallback);
  } catch {
    return fallback;
  }
}
