import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { toast } from "sonner";

import {
  mergeTutorialState,
  readTutorialState,
  type AdminTutorialState,
  type TutorialPatch,
} from "@/types/tutorial";

/**
 * One copy of the tutorial progress for the whole page. Every mounted instance (the Help menu,
 * the dashboard) reads and writes this copy, so a write from one cannot be undone by a stale
 * copy in another.
 */
let sharedState: AdminTutorialState | null = null;
// The user the shared copy belongs to. A different admin signing in starts from their own stored copy.
let sharedOwner: string | null = null;
const listeners = new Set<(next: AdminTutorialState) => void>();

function publish(next: AdminTutorialState) {
  sharedState = next;
  listeners.forEach((listener) => listener(next));
}

/**
 * Per-admin tutorial progress, saved in Clerk unsafeMetadata under `adminTutorial`.
 * Updates the screen first, then saves. If saving fails, the change is rolled back
 * (unless a newer change has been made since) and the admin sees an error toast.
 */
export function useAdminTutorialProgress() {
  const { user, isLoaded } = useUser();
  const [state, setState] = useState<AdminTutorialState>(
    () => sharedState ?? readTutorialState(user?.unsafeMetadata?.adminTutorial),
  );

  useEffect(() => {
    listeners.add(setState);
    return () => {
      listeners.delete(setState);
    };
  }, []);

  // Pick up the stored value once Clerk has loaded the user, unless this session already changed it.
  useEffect(() => {
    if (!isLoaded || !user) return;
    if (sharedOwner !== user.id) {
      sharedOwner = user.id;
      sharedState = null;
    }
    if (sharedState !== null) return;
    publish(readTutorialState(user.unsafeMetadata?.adminTutorial));
  }, [isLoaded, user]);

  const update = useCallback(
    async (patch: TutorialPatch) => {
      if (!user) return;
      const previous = sharedState ?? readTutorialState(user.unsafeMetadata?.adminTutorial);
      const next = mergeTutorialState(previous, patch);
      publish(next);
      try {
        await user.update({
          unsafeMetadata: { ...(user.unsafeMetadata ?? {}), adminTutorial: next },
        });
      } catch {
        // Roll back only if nothing newer was saved in the meantime.
        if (sharedState === next) publish(previous);
        toast.error("Could not save your tutorial progress. It will show again next time.");
      }
    },
    [user],
  );

  return { state, update, loaded: isLoaded };
}
