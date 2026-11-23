import { API_BASE_URL } from "@/config/api";
import { notifyIfAccountDeactivated } from "@/lib/accountStatus";

// Reusable helper for authenticated backend calls with Clerk bearer tokens.
export async function fetchWithClerkAuth(
  path: string,
  token: string,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init?.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  notifyIfAccountDeactivated(response);
  return response;
}
