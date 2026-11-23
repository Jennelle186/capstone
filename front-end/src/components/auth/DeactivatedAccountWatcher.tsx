import { useEffect } from "react";
import { useClerk } from "@clerk/clerk-react";
import { ACCOUNT_DEACTIVATED_EVENT, ACCOUNT_DEACTIVATED_QUERY } from "@/lib/accountStatus";

// Signs the user out when any API call reports that their account was deactivated, and sends
// them to the login page with a notice. Rendered once, inside ClerkProvider.
export default function DeactivatedAccountWatcher() {
  const { signOut } = useClerk();

  useEffect(() => {
    let signingOut = false;
    const handle = async () => {
      if (signingOut) return;
      signingOut = true;
      try {
        await signOut({ redirectUrl: `/auth/login?${ACCOUNT_DEACTIVATED_QUERY}` });
      } catch {
        // If sign-out fails, still send the user to the login page with the notice.
        window.location.assign(`/auth/login?${ACCOUNT_DEACTIVATED_QUERY}`);
      }
    };
    window.addEventListener(ACCOUNT_DEACTIVATED_EVENT, handle);
    return () => window.removeEventListener(ACCOUNT_DEACTIVATED_EVENT, handle);
  }, [signOut]);

  return null;
}
