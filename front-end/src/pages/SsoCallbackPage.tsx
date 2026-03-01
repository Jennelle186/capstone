import { AuthenticateWithRedirectCallback } from "@clerk/clerk-react";

export default function SsoCallbackPage() {
  // Handles OAuth redirect completion for Clerk social auth flows.
  return <AuthenticateWithRedirectCallback />;
}
