import { API_BASE_URL } from "@/config/api";

// Reusable helper for authenticated backend calls with Clerk bearer tokens.
export async function fetchWithClerkAuth(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}
